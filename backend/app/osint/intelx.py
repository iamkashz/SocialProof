"""IntelligenceX paste-site and leak search.

Metadata-only — we list records via `/intelligent/search/result` and
never fetch content via `/file/read` or `/file/view`. Bucket + title +
date is enough to score risk without spending download credits.

Bucket scope:
  - Listed (visible): pastes, leaks.public, darknet, dumpster.
  - Counted only (redacted content, count-visible via
    `/intelligent/search/statistic`): leaks.logs, leaks.private.
  - Whois/DNS/Usenet/gov-archives are excluded — noise for self-scans.

Hit titles can contain plaintext credential fragments, so we truncate
to 100 chars and never return raw snippets.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

_BASE_URL = os.getenv("INTELX_BASE_URL", "https://free.intelx.io")

# Buckets we list records from (content/metadata visible on free tier).
_VISIBLE_BUCKETS = ["pastes", "leaks.public", "darknet", "dumpster"]

# Buckets that are redacted on the free tier — records exist but the
# content is hidden. /intelligent/search/statistic still returns
# per-bucket counts for these, so we can score their presence without
# paying. Prefix match against returned bucket names (which can be more
# specific, e.g. `leaks.private.general`).
_REDACTED_BUCKET_PREFIXES = ("leaks.logs", "leaks.private")

# All buckets we request from the search. The redacted ones drive the
# statistic-only signal; the visible ones drive the per-record list.
_BUCKETS = [*_VISIBLE_BUCKETS, "leaks.logs", "leaks.private"]

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
        # Redacted-bucket counts from /statistic. Free tier hides the
        # records themselves but exposes the per-bucket totals.
        "redacted_hit_count": 0,
        "redacted_buckets": {},
    }
    if error:
        payload["error"] = error
    return payload


def _is_redacted_bucket(bucket: str) -> bool:
    """True if bucket is one we can count but not read on the free tier."""
    return any(bucket.startswith(p) for p in _REDACTED_BUCKET_PREFIXES)


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

            # Statistic endpoint reports per-bucket counts for ALL
            # buckets we searched, including the redacted ones. Same
            # `id` as the result poll; no extra credit cost.
            redacted_counts: dict[str, int] = {}
            try:
                stat = await client.get(
                    f"{_BASE_URL}/intelligent/search/statistic",
                    params={"id": search_id},
                )
                if stat.status_code < 400:
                    for entry in (stat.json().get("bucket") or []):
                        name = entry.get("bucket") or ""
                        count = int(entry.get("count") or 0)
                        if _is_redacted_bucket(name) and count > 0:
                            redacted_counts[name] = count
            except (httpx.HTTPError, ValueError):
                pass  # best-effort — redacted-count signal is bonus, not required

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
        # Redacted buckets may slip through here even though we requested
        # them as part of the same search — the records exist but their
        # content is masked. Counted via /statistic above; skip here so
        # the visible-hits list stays just visible records.
        if _is_redacted_bucket(bucket):
            continue
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
        "redacted_hit_count": sum(redacted_counts.values()),
        "redacted_buckets": redacted_counts,
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
