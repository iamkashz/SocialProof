"""Logging helpers — privacy-preserving formatters for sensitive values.

Raw user emails should never appear in log lines. Logs end up in Cloud
Logging, in stdout buffers grep'd by oncall, in screenshots pasted into
chat. Anywhere an email lands in a log message, use `email_for_log()`
instead — it returns a short stable hash that's correlatable across
log lines but doesn't expose the address itself.

If an email is genuinely never present (e.g. the cache filename is
already hashed before it touches the log call), no need to use this —
this is the catch-all so future code stays honest by default.
"""

from __future__ import annotations

import hashlib


def email_for_log(email: str) -> str:
    """Return a short, stable, non-reversible token for safe log inclusion.

    Format: `e:<first8>` where <first8> is the first 8 hex chars of
    sha256(lower(strip(email))). Short enough to read inline; long
    enough to correlate the same email across log lines.
    """
    if not email:
        return "e:-"
    h = hashlib.sha256(email.strip().lower().encode()).hexdigest()[:8]
    return f"e:{h}"
