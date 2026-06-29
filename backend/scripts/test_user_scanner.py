"""Standalone smoke test for user_scanner_email_lookup.

Runs the wrapper against a list of test emails, prints timing and a
compact summary. Run BEFORE wiring user-scanner into the agent graph
so we can validate the wrapper output shape and skip-list behavior
independently of the rest of the pipeline.

Usage:
    cd backend
    uv run python scripts/test_user_scanner.py [email ...]

If no emails are given, runs against the default test set.
"""

from __future__ import annotations

import asyncio
import sys
import time
from collections import Counter

from app.osint.user_scanner_lookup import user_scanner_email_lookup_async

_DEFAULT_EMAILS = [
    "test@example.com",
]


async def run_one(email: str) -> None:
    print(f"\n=== {email} ===")
    t0 = time.perf_counter()
    result = await user_scanner_email_lookup_async(email)
    elapsed = time.perf_counter() - t0

    print(
        f"  checked: {result['checked_count']}  "
        f"found: {result['found_count']}  "
        f"errors: {result['errors']}  "
        f"elapsed: {elapsed:.1f}s"
    )

    if result.get("error"):
        print(f"  ERROR: {result['error']}")

    if result["accounts"]:
        by_cat = Counter(a.get("category") for a in result["accounts"])
        print(f"  categories: {dict(by_cat)}")
        print("  hits:")
        for a in result["accounts"]:
            cat = a.get("category", "?")
            name = a.get("site_name", "?")
            url = a.get("url") or ""
            print(f"    [{cat}] {name}  {url}")


async def main() -> None:
    emails = sys.argv[1:] or _DEFAULT_EMAILS
    print(f"Running user-scanner against {len(emails)} email(s)...")
    for email in emails:
        await run_one(email)
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
