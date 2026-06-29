"""Daily file-cache for scan results.

Engineering decisions:

1. **Day-bucketed by sha256(email).** One scan per email per calendar day.
   This is conservative — OSINT sources change slowly, the user is mostly
   re-running for demo/iteration purposes. Hashing the email avoids
   PII-shaped filenames on disk.

2. **Stores the SSE event stream, not the final state.** On a cache hit we
   replay the recorded frames in order, so the UI's existing event handler
   needs no changes and renders identically to a fresh scan (timeline,
   tool cards, risk gauge, summary).

3. **Cache writes happen after the stream ends.** We tee every frame into
   a list during the live stream, then persist on `done`. Failed scans
   (those that emitted an `error` frame) are NOT cached — the user would
   be stuck replaying a broken result. Recoverable `warning` frames ARE
   cached: the data was valid, only the narrator failed.

4. **Cache directory is relative to the project root.** When this is
   hosted, the working directory may not match the source layout, so we
   anchor on `__file__`'s parent rather than `os.getcwd()`. Falls back
   gracefully if the directory is read-only.

5. **No size cap, no eviction.** Day-bucketed + email-hashed means at
   most one file per unique email per day. For a capstone demo this will
   never grow beyond a few hundred files. If this ever ships for real,
   add a cron to delete files older than N days.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

# Cache directory is anchored to the project (one level up from app/), so
# the path is stable regardless of where the server is started from.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CACHE_DIR = _PROJECT_ROOT / "recent-scans"


def _ensure_cache_dir() -> Path | None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        return _CACHE_DIR
    except OSError as exc:
        logger.warning("cache: cannot create %s: %s", _CACHE_DIR, exc)
        return None


def _email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]


def _today_key() -> str:
    return date.today().isoformat()


def _path_for(email: str, day: str | None = None) -> Path | None:
    cache_dir = _ensure_cache_dir()
    if cache_dir is None:
        return None
    return cache_dir / f"{_email_hash(email)}.{day or _today_key()}.json"


def load(email: str) -> dict | None:
    """Return the cached scan payload for this email/today, or None.

    Payload shape:
        {
            "email_hash": "...",
            "cached_at": "2026-06-26T17:30:00",
            "frames": [
                {"type": "tool_call", ...},
                {"type": "tool_response", ...},
                ...
                {"type": "final", "text": "..."},
            ],
        }
    """
    path = _path_for(email)
    if path is None or not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("cache: failed to load %s: %s", path, exc)
        return None


def save(email: str, frames: list[dict], cached_at: str) -> None:
    """Persist scan frames for replay on subsequent same-day requests.

    Skips writing if any frame is an `error` (caller already checked this
    by convention, but we double-check to avoid caching broken state).
    """
    if any(f.get("type") == "error" for f in frames):
        logger.info("cache: refusing to save scan with error frames")
        return
    path = _path_for(email)
    if path is None:
        return
    payload = {
        "email_hash": _email_hash(email),
        "cached_at": cached_at,
        "frames": frames,
    }
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        os.replace(tmp_path, path)
    except OSError as exc:
        logger.warning("cache: failed to save %s: %s", path, exc)
        tmp_path.unlink(missing_ok=True)


def clear(email: str) -> None:
    """Delete the cached entry for this email (used by force_fresh requests
    so the next save replaces cleanly without orphaning a stale file)."""
    path = _path_for(email)
    if path is not None and path.exists():
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("cache: failed to clear %s: %s", path, exc)
