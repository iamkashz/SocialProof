"""Deterministic risk scoring and remediation generation.

This is intentionally NOT an LLM call. The agent passes a structured summary
of findings; this function computes the score and remediations using fixed
rules. Keeping it deterministic guarantees consistent scoring and avoids
hallucinated risk numbers.

Formula v2 (category-based with logarithmic diminishing returns):

    Four sub-scores, each capped at 25 points, summed to 0-100.
    Each category captures one dimension of exposure:

      Credential Exposure  (0-25)   breaches, password leakage, data class breadth
      Leak Presence        (0-25)   paste/darknet visibility (visible + redacted-count)
      Identity Correlation (0-25)   real name, location, linked usernames (+interaction)
      Attack Surface       (0-25)   public accounts + registered services

    Counts use `log_scale(n, k, cap) = min(cap, k * log2(1+n))` so the
    first few instances of any signal contribute heavily and additional
    counts yield diminishing marginal points. Prevents the
    "many small signals → saturated score" problem.

    Reaching Critical requires multi-dimensional exposure: maxing one
    category alone only gets you to 25.

Floor rule: if `password_exposed_in_any_breach` is True, the total is
forced to a minimum of 25 (Moderate). A leaked password is immediately
actionable for credential stuffing — under-scoring it would be wrong
even when the user has no public footprint.

The public `/score` page mirrors this formula exactly — any change
here MUST be reflected on `frontend/src/routes/score.tsx`. Drift
breaks trust.
"""

from __future__ import annotations

import math

_SENSITIVE_DATA_CLASSES = frozenset({"Passwords", "Password", "passwords", "password"})


def _log_scale(n: int, k: float, cap: float) -> float:
    """Logarithmic diminishing returns: k * log2(1 + n), capped at `cap`.

    n=0 contributes 0. Each additional count contributes less than the
    previous one. Useful for "more is worse but with sharp diminishing
    returns" — being in 1 breach is much worse than 0; the 8th breach
    is barely worse than the 5th.
    """
    if n <= 0:
        return 0.0
    return min(cap, k * math.log2(1 + n))


def _score_credential(
    breach_count: int,
    password_exposed: bool,
    exposed_data_class_count: int,
) -> float:
    """Category 1 (0-25). Credential exposure dimension."""
    c = _log_scale(breach_count, 6.0, 15)
    c += 7 if password_exposed else 0
    c += _log_scale(exposed_data_class_count, 2.5, 8)
    return min(25.0, c)


def _score_leak(
    paste_hit_count_visible: int,
    paste_hit_count_redacted: int,
) -> float:
    """Category 2 (0-25). Leak/paste presence dimension."""
    c = _log_scale(paste_hit_count_visible, 5.0, 18)
    c += _log_scale(paste_hit_count_redacted, 2.0, 10)
    return min(25.0, c)


def _score_identity(
    real_name_exposed: bool,
    location_exposed: bool,
    linked_username_count: int,
) -> float:
    """Category 3 (0-25). Identity correlation dimension.

    Includes a +4 interaction bonus when name AND location are both
    exposed — the combination enables targeted pretexting and data-
    broker enrichment that neither alone enables.
    """
    c = 0.0
    c += 5 if real_name_exposed else 0
    c += 4 if location_exposed else 0
    if real_name_exposed and location_exposed:
        c += 4  # interaction: name + location is superlinear for attackers
    c += _log_scale(linked_username_count, 4.0, 12)
    return min(25.0, c)


def _score_surface(
    public_account_count: int,
    account_registration_count: int,
) -> float:
    """Category 4 (0-25). Attack surface dimension.

    public_account_count (confirmed username-keyed probes) and
    account_registration_count (email-keyed user-scanner probes)
    overlap conceptually — we use a primary/secondary decomposition
    rather than summing them to avoid double-counting:

      primary = max(public_account_count, account_registration_count)
                — full weight (k=4.0)
      secondary = min(public_account_count, account_registration_count)
                — reduced weight (k=1.0) for marginal corroboration

    Two independent detection methods agreeing on a service IS extra
    evidence, but not double evidence. The k=1.0 secondary reflects that.
    """
    primary = max(public_account_count, account_registration_count)
    secondary = min(public_account_count, account_registration_count)
    c = _log_scale(primary, 4.0, 18) + _log_scale(secondary, 1.0, 7)
    return min(25.0, c)


def correlate_risk(
    email: str,
    summary: str,
    breach_count: int,
    exposed_data_classes: list[str],
    public_accounts_found: int,
    real_name_exposed: bool,
    location_exposed: bool,
    linked_usernames: list[str],
    paste_hit_count: int = 0,
    account_registration_count: int = 0,
    paste_hit_count_redacted: int = 0,
) -> dict:
    """Compute the final risk score and remediation list from gathered findings.

    Args:
        email: The investigation target.
        summary: A short narrative tying findings together (becomes the
            "attack chain" in the report).
        breach_count: Number of breaches the email appears in.
        exposed_data_classes: All data classes leaked across breaches
            (e.g., ["Passwords", "Email addresses", "Names"]).
        public_accounts_found: Number of public platform accounts confirmed
            via username enumeration (the pivot loop's username-keyed probes).
        real_name_exposed: True if a real name was discovered on any public
            profile.
        location_exposed: True if a location was discovered on any public
            profile.
        linked_usernames: Usernames discovered to be in use across platforms.
        paste_hit_count: Visible (content-readable) paste/leak hits from
            IntelligenceX. Strong evidence — counts as primary leak signal.
        account_registration_count: Email-keyed account registrations from
            user-scanner. Overlaps semantically with public_accounts_found
            but is a different detection method; handled via primary/
            secondary decomposition in the Attack Surface category.
        paste_hit_count_redacted: Counts-only paste/leak hits from
            IntelligenceX redacted corpora. Weaker evidence than visible
            hits (we can't verify content), but still real corpus presence.

    Returns:
        Dict with keys: email, risk_score (0-100), severity (Low/Moderate/
        High/Critical), attack_chain (the summary), category_scores (the
        four sub-scores), remediations (sorted by priority), linked_usernames,
        and echoes of paste_hit_count, paste_hit_count_redacted,
        account_registration_count so downstream consumers see what drove
        the score.
    """
    password_exposed = any(c in _SENSITIVE_DATA_CLASSES for c in exposed_data_classes)
    data_class_count = len(exposed_data_classes)
    linked_username_count = len(linked_usernames)

    cred = _score_credential(breach_count, password_exposed, data_class_count)
    leak = _score_leak(paste_hit_count, paste_hit_count_redacted)
    identity = _score_identity(real_name_exposed, location_exposed, linked_username_count)
    surface = _score_surface(public_accounts_found, account_registration_count)

    total = cred + leak + identity + surface

    # Floor rule. A leaked password makes the email credential-stuffable
    # right now, regardless of public footprint. Force at least Moderate
    # so a user in 1 breach with passwords but no public profile doesn't
    # get a Low rating that misrepresents the real risk.
    if password_exposed:
        total = max(total, 25.0)

    score = min(100, round(total))

    if score >= 70:
        severity = "Critical"
    elif score >= 45:
        severity = "High"
    elif score >= 20:
        severity = "Moderate"
    else:
        severity = "Low"

    # Per-category sub-scores echoed so the UI / narrator can show
    # which dimension drove the rating, not just the total.
    category_scores = {
        "credential_exposure": round(cred, 1),
        "leak_presence": round(leak, 1),
        "identity_correlation": round(identity, 1),
        "attack_surface": round(surface, 1),
    }

    remediations: list[dict] = []
    if breach_count > 0:
        remediations.append(
            {
                "priority": 1,
                "title": "Rotate passwords on every breached service",
                "detail": (
                    "Use a password manager and ensure every account uses a "
                    "unique, strong password. Reused passwords from breaches "
                    "power credential stuffing."
                ),
            }
        )
        remediations.append(
            {
                "priority": 2,
                "title": "Enable two-factor authentication (2FA) everywhere",
                "detail": (
                    "Prefer hardware keys or authenticator apps over SMS. "
                    "2FA defeats most credential-stuffing attacks."
                ),
            }
        )
    if data_class_count > 3:
        sample = ", ".join(exposed_data_classes[:5])
        remediations.append(
            {
                "priority": 2,
                "title": "Assume your PII is public",
                "detail": (
                    f"Treat exposed data classes ({sample}) as known to "
                    "attackers. Avoid using them as security answers."
                ),
            }
        )
    if real_name_exposed or location_exposed:
        remediations.append(
            {
                "priority": 3,
                "title": "Audit public profiles for over-sharing",
                "detail": (
                    "Remove real name, employer, and location from public "
                    "dev profiles (GitHub, GitLab, Gravatar) unless you need "
                    "them professionally."
                ),
            }
        )
    if public_accounts_found > 4:
        remediations.append(
            {
                "priority": 3,
                "title": "Diversify usernames across platforms",
                "detail": (
                    "A single shared handle lets attackers pivot easily. "
                    "Use distinct usernames for low-trust services."
                ),
            }
        )
    if account_registration_count >= 10:
        remediations.append(
            {
                "priority": 2,
                "title": "Compartmentalize email use across services",
                "detail": (
                    f"This email is registered on at least "
                    f"{account_registration_count} public services. A single "
                    "address used everywhere means one breach exposes your "
                    "entire footprint. Use per-service aliases or split into "
                    "shopping / social / work addresses."
                ),
            }
        )
    if paste_hit_count > 0 or paste_hit_count_redacted > 0:
        total_paste = paste_hit_count + paste_hit_count_redacted
        remediations.append(
            {
                "priority": 1,
                "title": "Investigate paste-site and leak appearances",
                "detail": (
                    f"This email appears in {total_paste} paste-site, leak, "
                    "or darknet record(s). Look up the items on intelx.io to "
                    "identify which credentials or data was exposed, then "
                    "rotate anything that may have leaked."
                ),
            }
        )
    remediations.append(
        {
            "priority": 4,
            "title": "Set up breach monitoring",
            "detail": (
                "Subscribe to free breach-alert services so you learn about "
                "new exposures before attackers exploit them."
            ),
        }
    )
    remediations.append(
        {
            "priority": 5,
            "title": "Use email aliases",
            "detail": (
                "Sign up to new services with per-service aliases (e.g. iCloud "
                "Hide My Email, SimpleLogin) so a breach at one site doesn't "
                "expose your primary identity."
            ),
        }
    )

    return {
        "email": email,
        "risk_score": score,
        "severity": severity,
        "category_scores": category_scores,
        "attack_chain": summary,
        "remediations": sorted(remediations, key=lambda r: r["priority"]),
        "linked_usernames": linked_usernames,
        # Echo the inputs so downstream consumers (narrator, UI) can
        # reference the same counts that drove the score.
        "paste_hit_count": paste_hit_count,
        "paste_hit_count_redacted": paste_hit_count_redacted,
        "account_registration_count": account_registration_count,
    }
