"""Deterministic risk scoring and remediation generation.

This is intentionally NOT an LLM call. The agent passes a structured summary
of findings; this function computes the score and remediations using fixed
rules. Keeping it deterministic guarantees consistent scoring and avoids
hallucinated risk numbers.
"""

from __future__ import annotations

_SENSITIVE_DATA_CLASSES = frozenset({"Passwords", "Password", "passwords", "password"})


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
            via username enumeration.
        real_name_exposed: True if a real name was discovered on any public
            profile.
        location_exposed: True if a location was discovered on any public
            profile.
        linked_usernames: Usernames discovered to be in use across platforms.

    Returns:
        Dict with keys: email, risk_score (0-100), severity (Low/Moderate/High/
        Critical), attack_chain (the summary), remediations (sorted by priority),
        linked_usernames.
    """
    # NOTE: any change to the rules below must be reflected on the public
    # `/score` page (frontend/src/routes/score.tsx). The page documents
    # this exact formula to the end user; drift breaks trust.
    score = 0
    score += min(40, breach_count * 6)
    if any(c in _SENSITIVE_DATA_CLASSES for c in exposed_data_classes):
        score += 20
    if len(exposed_data_classes) > 5:
        score += 10
    score += min(15, public_accounts_found * 2)
    if real_name_exposed:
        score += 8
    if location_exposed:
        score += 7
    # Paste-site / leak hits are strong signal: even one means the email's
    # been seen circulating outside the user's control. Cap so a noisy
    # email doesn't dominate the score.
    if paste_hit_count > 0:
        score += min(15, 5 + paste_hit_count)
    # user-scanner account registrations: each one is a foothold for
    # phishing and gives an attacker a richer target profile. Capped
    # because being on 50 services isn't dramatically worse than being
    # on 20 — the existing breach + paste signals dominate at the top end.
    if account_registration_count > 0:
        score += min(15, account_registration_count)
    score = min(100, score)

    if score >= 75:
        severity = "Critical"
    elif score >= 50:
        severity = "High"
    elif score >= 25:
        severity = "Moderate"
    else:
        severity = "Low"

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
    if len(exposed_data_classes) > 3:
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
    if paste_hit_count > 0:
        remediations.append(
            {
                "priority": 1,
                "title": "Investigate paste-site and leak appearances",
                "detail": (
                    f"This email appears in {paste_hit_count} paste-site, leak, "
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
        "attack_chain": summary,
        "remediations": sorted(remediations, key=lambda r: r["priority"]),
        "linked_usernames": linked_usernames,
        # Echo the deduped value so downstream consumers (narrator UI) can
        # reference the same count that drove the score.
        "paste_hit_count": paste_hit_count,
        "account_registration_count": account_registration_count,
    }
