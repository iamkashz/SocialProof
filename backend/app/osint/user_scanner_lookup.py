"""user-scanner wrapper.

user-scanner is a community OSINT tool (kaifcodec, MIT, PyPI) that
probes 100+ services for account-existence side channels (signup,
password-reset, profile lookup, etc.).

We call `engine.check_category` per kept category in parallel rather
than `run_email_full_batch` because the latter scans ALL categories
and there's no built-in category skip. Filtering after-the-fact still
hits the wire for sites we don't want, costing scan time and IP load.
Calling only the kept categories cuts ~25 unnecessary HTTP probes
(news 7 + sports 3 + jobs 1 + crm 4 + adult 12) per scan and avoids
flagging the user's IP for sites they didn't ask to probe.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from user_scanner.core import engine

logger = logging.getLogger(__name__)

# Hard timeout. We fan out ~13 categories of HTTP probes; one stalled
# upstream shouldn't block the whole scan. Long enough for legitimate
# checks to finish; short enough that the user isn't waiting forever.
_TIMEOUT_SEC = 60.0

# Categories we DO scan (email side). user-scanner exposes 18 email
# categories total. Excluded by intent:
#   adult     — privacy-sensitive, ethically dubious to probe
#   news      — news-site accounts are anonymous-by-default, low signal
#   sports    — sport-fan accounts aren't actionable for an attacker
#   jobs      — too narrow (one module)
#   crm       — enterprise CRMs aren't useful attack-surface signal
# Excluding at request time (not after-the-fact filter) saves the HTTP
# probes against those sites entirely.
_KEEP_CATEGORIES: tuple[str, ...] = (
    "community",
    "creator",
    "dev",
    "entertainment",
    "fitness",
    "gaming",
    "hosting",
    "learning",
    "music",
    "other",
    "shopping",
    "social",
    "travel",
)

# Per-site overrides within kept categories. Populated as we tune
# against real scans. Module-name match (e.g. "indiatimes"), not
# site_label.
_SKIP_SITES: frozenset[str] = frozenset()


def _module_name_from_result(d: dict) -> str:
    """Recover the user-scanner module name from a Result.site_name for
    skip-list matching. site_name is derived from the module file via
    .capitalize() and underscore→dot replacement; reverse that here.
    """
    name = (d.get("site_name") or "").strip()
    if not name:
        return ""
    return name.lower().replace(".", "_").replace(" (twitter)", "")


def _to_dict(result: Any) -> dict:
    if hasattr(result, "as_dict"):
        return result.as_dict()
    if isinstance(result, dict):
        return result
    return {}


async def _scan_categories(email: str) -> list[Any]:
    """Run user-scanner against the kept categories in parallel.

    engine.check_category is already async; running each kept category
    concurrently with asyncio.gather gets us one wall-clock round-trip
    instead of N sequential ones. Skipped categories never hit the wire.
    """
    tasks = [engine.check_category(cat, email, is_email=True) for cat in _KEEP_CATEGORIES]
    nested = await asyncio.gather(*tasks, return_exceptions=True)
    flat: list[Any] = []
    for sublist in nested:
        if isinstance(sublist, BaseException):
            logger.warning("user_scanner: category scan failed: %s", sublist)
            continue
        flat.extend(sublist)
    return flat


async def user_scanner_email_lookup_async(email: str) -> dict[str, Any]:
    """Run user-scanner against the email and return a JSON-friendly result.

    Returns a dict shaped consistently with the other osint/ lookups so
    the recon agent can store it into session state without bespoke
    handling. Failures (timeout, library error) are surfaced as an
    empty result with `error` populated — the rest of the scan keeps
    going, matching how the other recon sources behave on failure.
    """
    if not email:
        return _empty_result()

    try:
        results = await asyncio.wait_for(_scan_categories(email), timeout=_TIMEOUT_SEC)
    except TimeoutError:
        logger.warning("user_scanner: scan timed out after %ss", _TIMEOUT_SEC)
        return _empty_result(error=f"timeout after {_TIMEOUT_SEC}s")
    except Exception as exc:
        # Broad except is intentional: surface any failure mode as an empty
        # result rather than crashing the recon agent. The rest of the scan
        # continues; UI shows the agent's `error` field.
        logger.warning("user_scanner: scan failed: %s", exc)
        return _empty_result(error=str(exc))

    accounts: list[dict[str, Any]] = []
    errors = 0
    checked = 0

    for raw in results:
        d = _to_dict(raw)
        if not d:
            continue
        checked += 1

        if _module_name_from_result(d) in _SKIP_SITES:
            continue

        status = d.get("status")
        if status == "Registered":
            accounts.append(
                {
                    "site_name": d.get("site_name"),
                    "category": d.get("category"),
                    "url": d.get("url"),
                    "extra": d.get("extra") or {},
                }
            )
        elif status == "Error":
            errors += 1

    accounts.sort(key=lambda a: ((a.get("category") or ""), (a.get("site_name") or "")))

    return {
        "checked_count": checked,
        "found_count": len(accounts),
        "accounts": accounts,
        "errors": errors,
    }


def user_scanner_email_lookup(email: str) -> dict[str, Any]:
    """Sync facade for non-async callers.

    Should NOT be called from inside an existing event loop — use the
    async version. Kept for parity with the other osint/ lookups in
    case a future caller needs it.
    """
    return asyncio.run(user_scanner_email_lookup_async(email))


def _empty_result(error: str | None = None) -> dict[str, Any]:
    base: dict[str, Any] = {
        "checked_count": 0,
        "found_count": 0,
        "accounts": [],
        "errors": 0,
    }
    if error:
        base["error"] = error
    return base
