"""Username enumeration via user-scanner.

Thin shape adapter around `engine.check_category`: probes the four
OSINT-relevant category directories (social, dev, creator, community)
and returns the canonical {username, total_checked, exists_count,
platforms} envelope the analyst and UI expect.
"""

from __future__ import annotations

import asyncio
import logging
import re

from user_scanner.core import engine

logger = logging.getLogger(__name__)

# Categories scanned. Order is presentation-only; engine.check_category
# returns results per-category, we concatenate.
_CATEGORIES: tuple[str, ...] = ("social", "dev", "creator", "community")

# Hard cap on the whole multi-category scan. user-scanner fans out
# ~95 HTTP probes across these four categories; a stalled upstream
# shouldn't block the pivot loop indefinitely.
_TIMEOUT_SEC = 60.0

# Mirror the email-side wrapper's defensive posture: drop any results
# that slip in from categories we intend to exclude. Defense-in-depth
# against a future user-scanner version moving a module between
# directories.
_SKIP_CATEGORIES = frozenset({"adult", "crm", "jobs", "sports", "news"})

# Per-site overrides within kept categories. Empty by default; populate
# as patterns emerge from real-world scans (false-positives, dead sites,
# loud probes).
_SKIP_SITES: frozenset[str] = frozenset()

# Mirrors the prior sanitizer — strip anything that's not URL-safe in a
# username before handing to user-scanner's per-module validators.
_USERNAME_SANITIZER = re.compile(r"[^a-zA-Z0-9_.\-]")


def _module_name(site_label: str) -> str:
    """Recover the user-scanner module name from a Result.site_name.

    site_name is derived from the module file via .capitalize() and
    underscore→dot replacement; reverse that for skip-list matching.
    Same approach as `user_scanner_lookup.py`.
    """
    if not site_label:
        return ""
    return site_label.lower().replace(".", "_").replace(" (twitter)", "")


def _result_to_platform_row(d: dict, username: str) -> dict | None:
    """Transform a user-scanner Result dict into the platform-row shape
    downstream code (analyst, narrator, React `AccountEnumRender`)
    already consumes.

    Returns None for skip-listed entries so the caller can drop them
    cleanly without counting them in total_checked.
    """
    if not d:
        return None
    category = (d.get("category") or "").lower()
    if category in _SKIP_CATEGORIES:
        return None
    if _module_name(d.get("site_name") or "") in _SKIP_SITES:
        return None

    status = d.get("status")
    # user-scanner reports "Found"/"Not Found" for username scans and
    # "Registered"/"Not Registered" for email scans; we only call the
    # username path here but normalize defensively.
    exists = status in ("Found", "Registered")

    return {
        "platform": d.get("site_name") or "(unknown)",
        "username": username,
        "url": d.get("url"),
        "exists": exists,
    }


def _empty_result(username: str) -> dict:
    return {
        "username": username,
        "total_checked": 0,
        "exists_count": 0,
        "platforms": [],
    }


async def _scan_categories(username: str) -> list[dict]:
    """Fan out user-scanner category scans in parallel and flatten.

    engine.check_category is already async; running the four categories
    concurrently with asyncio.gather gets us a single round-trip wall-
    clock instead of four sequential ones.
    """
    tasks = [
        engine.check_category(cat, username, is_email=False) for cat in _CATEGORIES
    ]
    nested = await asyncio.gather(*tasks, return_exceptions=True)

    flat: list[dict] = []
    for sublist in nested:
        if isinstance(sublist, BaseException):
            logger.warning("username_enum: category scan failed: %s", sublist)
            continue
        for r in sublist:
            if hasattr(r, "as_dict"):
                flat.append(r.as_dict())
            elif isinstance(r, dict):
                flat.append(r)
    return flat


async def username_enum_async(username: str) -> dict:
    """Async form — call this from inside an event loop (ADK agents).

    Returns the canonical platform-enum shape:
        {
            "username": str,        # sanitized form actually probed
            "total_checked": int,   # platforms that returned a usable result
            "exists_count": int,    # subset where the account is registered
            "platforms": [
                {"platform": str, "username": str, "url": str, "exists": bool},
                ...
            ],
        }
    """
    cleaned = _USERNAME_SANITIZER.sub("", username or "")
    if not cleaned:
        return _empty_result(username)

    try:
        raw = await asyncio.wait_for(_scan_categories(cleaned), timeout=_TIMEOUT_SEC)
    except TimeoutError:
        logger.warning("username_enum: scan timed out after %ss", _TIMEOUT_SEC)
        return _empty_result(cleaned)
    except Exception as exc:
        # Broad except is intentional: surface any failure mode as an
        # empty result rather than crashing the pivot loop. The rest of
        # the scan continues; UI shows zero platforms found.
        logger.warning("username_enum: scan failed: %s", exc)
        return _empty_result(cleaned)

    rows: list[dict] = []
    for d in raw:
        row = _result_to_platform_row(d, cleaned)
        if row is None:
            continue
        rows.append(row)

    rows.sort(key=lambda r: (not r["exists"], r["platform"].lower()))

    return {
        "username": cleaned,
        "total_checked": len(rows),
        "exists_count": sum(1 for r in rows if r["exists"]),
        "platforms": rows,
    }


def username_enum(username: str) -> dict:
    """Sync facade for non-async callers.

    Should NOT be called from inside an existing event loop — use the
    async form. Kept for parity with the other osint/ lookups.
    """
    return asyncio.run(username_enum_async(username))


__all__ = ["username_enum", "username_enum_async"]
