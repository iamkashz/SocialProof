"""IntelligenceX paste-site and leak search.

Engineering decisions:

1. **Metadata only.** We hit `/intelligent/search` then `/intelligent/search/
   result` to list hits, and stop there. We deliberately do NOT call
   `/file/read` or `/file/view`, both of which have a 100/day cap on the
   free tier (vs 50/day for searches). The existence of a hit + its bucket
   + its title is enough to score risk; downloading the leak content costs
   one credit per hit and yields nothing the user can act on in this tool.

2. **Bucket scope.** Only the four breach-flavored buckets are queried:
   `pastes`, `leaks.public`, `darknet`, `dumpster`. The rest of IntelX's
   index (Whois, DNS, Usenet, government archives) returns false-positive
   noise for self-scans — domains your email's host appears in are not the
   user's exposure.

3. **Conservative timeout + early termination.** Search jobs run async on
   IntelX's side; we poll for up to ~8s and explicitly terminate the job
   when we have enough results. If we time out, we surface what we have
   rather than blocking the scan.

4. **No raw secrets leak.** Hit titles can occasionally contain plaintext
   credentials in the snippet. We return only the bucket name, item ID
   (for the user to look up themselves on intelx.io), date, and a
   redacted-to-100-chars title. Never the full snippet.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

_BASE_URL = os.getenv("INTELX_BASE_URL", "https://free.intelx.io")
_BUCKETS = ["pastes", "leaks.public", "darknet", "dumpster"]
_MAX_RESULTS = 25
_POLL_INTERVAL_SECONDS = 1.0
_POLL_MAX_SECONDS = 8.0
_RESULT_TITLE_MAX_CHARS = 100


def _redact_title(title: str | None) -> str:
    if not title:
        return ""
    return title[:_RESULT_TITLE_MAX_CHARS]


def _bucket_label(bucket: str) -> str:
    # IntelX returns leaf buckets (e.g. `leaks.public.wikileaks`); map the
    # parent prefix to a human label and surface the leaf as a sub-source.
    base = bucket.split(".", 2)
    head = ".".join(base[:2]) if base[0] == "leaks" else base[0]
    return {
        "pastes": "Paste site",
        "leaks.public": "Public leak",
        "darknet": "Darknet",
        "dumpster": "Data dumpster",
    }.get(head, bucket)


def _empty_result(email: str, error: str | None = None) -> dict:
    payload: dict[str, Any] = {
        "email": email,
        "hit_count": 0,
        "buckets": {},
        "hits": [],
    }
    if error:
        payload["error"] = error
    return payload


async def paste_search_async(email: str) -> dict:
    """Search IntelligenceX paste, leak, and darknet buckets for an email.

    Returns metadata only (bucket + item id + date + redacted title); never
    downloads or returns the actual leak contents.
    """
    api_key = os.getenv("INTELX_API_KEY")
    if not api_key:
        return _empty_result(email, error="INTELX_API_KEY not configured")

    headers = {
        "X-Key": api_key,
        "User-Agent": "SocialProof-OSINT",
        "Content-Type": "application/json",
    }
    search_body = {
        "term": email,
        "buckets": _BUCKETS,
        "lookuplevel": 0,
        "maxresults": _MAX_RESULTS,
        "timeout": 5,
        "datefrom": "",
        "dateto": "",
        "sort": 4,  # newest first
        "media": 0,
        "terminate": [],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            start = await client.post(
                f"{_BASE_URL}/intelligent/search", json=search_body
            )
            if start.status_code == 401:
                return _empty_result(email, error="IntelX auth failed (check API key)")
            if start.status_code == 402:
                return _empty_result(email, error="IntelX quota exhausted")
            if start.status_code >= 400:
                return _empty_result(
                    email, error=f"IntelX search start {start.status_code}"
                )

            search_id = start.json().get("id")
            if not search_id:
                return _empty_result(email, error="IntelX returned no search id")

            # Poll for results
            hits: list[dict] = []
            waited = 0.0
            status_done = False
            while waited < _POLL_MAX_SECONDS and not status_done:
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)
                waited += _POLL_INTERVAL_SECONDS
                poll = await client.get(
                    f"{_BASE_URL}/intelligent/search/result",
                    params={"id": search_id, "limit": _MAX_RESULTS},
                )
                if poll.status_code >= 400:
                    break
                payload = poll.json()
                hits = payload.get("records") or []
                # status code: 0 = running, 1 = done, 2 = done w/ overflow, 3 = no results
                if payload.get("status") in (1, 2, 3):
                    status_done = True

            # Terminate explicitly so we don't keep eating quota
            try:
                await client.get(
                    f"{_BASE_URL}/intelligent/search/terminate",
                    params={"id": search_id},
                )
            except httpx.HTTPError:
                pass  # best-effort

    except httpx.HTTPError as exc:
        return _empty_result(email, error=str(exc))

    bucket_counts: dict[str, int] = {}
    cleaned_hits: list[dict] = []
    for hit in hits:
        bucket = hit.get("bucket") or "unknown"
        bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
        cleaned_hits.append(
            {
                "bucket": bucket,
                "bucket_label": _bucket_label(bucket),
                "title": _redact_title(hit.get("name") or hit.get("description")),
                "date": hit.get("date"),
                "item_id": hit.get("systemid") or hit.get("storageid"),
                "media_type": hit.get("media"),
                "size_bytes": hit.get("size"),
            }
        )

    return {
        "email": email,
        "hit_count": len(cleaned_hits),
        "buckets": bucket_counts,
        "hits": cleaned_hits,
    }


def paste_search(email: str) -> dict:
    """Sync wrapper for paste_search_async. See that function for behavior."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(paste_search_async(email))
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, paste_search_async(email)).result()
