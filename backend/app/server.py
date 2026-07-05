"""Minimal FastAPI server for the SocialProof React UI.

This is a standalone local-dev server separate from `fast_api_app.py` (which
wires up Google Cloud Logging + telemetry for deployed environments). It
exposes a single SSE endpoint at POST /api/scan that streams ADK events
shaped for the React UI's agent-timeline component.

Run locally with:
    uv run uvicorn app.server:app --reload --port 8080
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app import cache
from app.agent import root_agent
from app.agents.root import _validate_email

load_dotenv()

logger = logging.getLogger(__name__)

_USER_ID = "socialproof-local-user"

# Only this agent's text is user-facing. Every other BaseAgent in the graph
# emits short status messages (seed_agent "Investigating …", pivot_guard
# "no new usernames …", identity_agent "N candidate username(s)") — those
# are internal diagnostics, not part of the executive summary, so we drop
# them at the stream boundary instead of leaking them into the UI.
_NARRATOR_AGENT_NAME = "narrator_agent"

app = FastAPI(title="SocialProof ADK", description="OSINT scanner backed by Google ADK")

# Per-IP rate limiter. /api/scan triggers IntelX (50 searches/day free
# tier), Gemini (per-model daily caps), and unauthenticated GitHub
# (30/hr). One misbehaving client can quietly exhaust those quotas for
# everyone. Limits picked for "demo / single-user" not "production":
#  - 5/min: handles one real user clicking around, kills abuse loops
#  - 30/hr: matches GitHub's unauthenticated ceiling — once we're capped
#    there, more requests aren't producing useful scans anyway


def _client_ip(request: Request) -> str:
    # Behind Cloud Run / any proxy: TCP peer is the proxy, real client IP
    # rides in X-Forwarded-For. Locally there's no XFF header, so this
    # falls straight through to the direct-peer address.
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


_limiter = Limiter(key_func=_client_ip, default_limits=["30/hour", "5/minute"])
app.state.limiter = _limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Allow Vite dev server (default 5173 + 8080) to hit the API.
_default_origins = "http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173"
_origins = [o.strip() for o in os.getenv("ALLOW_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# Defense-in-depth response headers. Today the API only emits JSON +
# SSE — no untrusted HTML — so XSS/clickjacking aren't currently
# exploitable. Adding the headers blocks whole classes of future
# regressions and answers the standard security-review checklist.
@app.middleware("http")
async def _security_headers(request, call_next):
    response = await call_next(request)
    # Block MIME-sniffing; force declared content-type.
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Disallow iframe embedding (clickjacking).
    response.headers.setdefault("X-Frame-Options", "DENY")
    # Don't leak full URL via Referer to cross-origin destinations.
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Powerful APIs we never use — explicitly off so an injected script
    # couldn't ask for camera/mic/geolocation.
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=()",
    )
    # Locked-down CSP for the JSON / SSE responses this API serves. The
    # React UI is hosted from Vite/TanStack on a different origin and
    # ships its own CSP if needed; this one defends the API surface.
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    )
    return response

_runner = InMemoryRunner(agent=root_agent, app_name="socialproof")


class ScanRequest(BaseModel):
    email: str
    session_id: str | None = None
    # When true, skip the daily cache and run a fresh scan. Triggered by
    # appending `?fresh=1` to the scan URL — intentionally not a UI
    # affordance, kept for ops / debugging.
    force_fresh: bool = False


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


# Frame types that should be preserved in the cache file. `start` and `done`
# are bookend markers we regenerate on replay; `cached` is only used on
# replay and never appears in a live stream.
_CACHEABLE_TYPES = frozenset(
    {"tool_call", "tool_response", "text", "final", "warning"}
)


async def _live_stream(email: str, session_id: str) -> AsyncIterator[dict]:
    """Run the agent and yield raw event dicts.

    Unlike the previous `_stream`, this yields plain dicts (not SSE-encoded
    strings) so the caller can both record them into the cache AND format
    them for the wire in one place.
    """
    # InMemoryRunner needs a session record before run_async.
    session_service = _runner.session_service
    try:
        await session_service.create_session(
            app_name="socialproof",
            user_id=_USER_ID,
            session_id=session_id,
        )
    except Exception:
        # Session may already exist if the client retries with the same id.
        pass

    message = types.Content(role="user", parts=[types.Part(text=email)])

    tool_args_by_id: dict[str, dict] = {}
    final_text_parts: list[str] = []

    try:
        async for event in _runner.run_async(
            user_id=_USER_ID,
            session_id=session_id,
            new_message=message,
        ):
            content = event.content
            if content is None or content.parts is None:
                continue
            for part in content.parts:
                if part.function_call is not None:
                    call = part.function_call
                    call_id = call.id or str(uuid.uuid4())
                    args = dict(call.args or {})
                    tool_args_by_id[call_id] = args
                    yield {
                        "type": "tool_call",
                        "id": call_id,
                        "name": call.name,
                        "args": args,
                    }
                elif part.function_response is not None:
                    resp = part.function_response
                    call_id = resp.id or ""
                    yield {
                        "type": "tool_response",
                        "id": call_id,
                        "name": resp.name,
                        "output": resp.response,
                        "input": tool_args_by_id.get(call_id, {}),
                    }
                elif part.text:
                    if event.author != _NARRATOR_AGENT_NAME:
                        # Internal agent diagnostics — not user-facing.
                        continue
                    if event.partial:
                        yield {"type": "text", "delta": part.text}
                    else:
                        final_text_parts.append(part.text)
        if final_text_parts:
            yield {"type": "final", "text": "".join(final_text_parts)}
    except Exception as exc:
        err = str(exc)
        # Narrator failures (quota, transient 5xx) are non-fatal: by the time
        # the narrator runs, every deterministic step has already streamed and
        # the UI has all the data it needs to render the risk gauge and
        # remediations.
        recoverable = (
            "RESOURCE_EXHAUSTED" in err
            or "429" in err
            or "503" in err
            or "narrator" in err.lower()
        )
        if recoverable:
            yield {
                "type": "warning",
                "message": (
                    "Executive summary unavailable for this scan. All "
                    "findings and the risk score above are valid."
                ),
            }
        else:
            yield {"type": "error", "message": err}


async def _stream_fresh(email: str, session_id: str) -> AsyncIterator[str]:
    """Run a live scan, tee frames into the cache, and stream to the client."""
    yield _sse({"type": "start", "session_id": session_id})
    recorded: list[dict] = []
    had_error = False
    async for frame in _live_stream(email, session_id):
        if frame["type"] in _CACHEABLE_TYPES:
            recorded.append(frame)
        if frame["type"] == "error":
            had_error = True
        yield _sse(frame)
    if not had_error and recorded:
        cache.save(
            email,
            recorded,
            cached_at=datetime.now(UTC).isoformat(timespec="seconds"),
        )
    yield _sse({"type": "done"})


async def _stream_cached(
    email: str, session_id: str, cached: dict
) -> AsyncIterator[str]:
    """Replay a previously-saved scan. Identical frame shapes to a live run,
    plus a leading `cached` frame so the UI can surface that the result is
    from disk."""
    yield _sse({"type": "start", "session_id": session_id})
    yield _sse(
        {
            "type": "cached",
            "cached_at": cached.get("cached_at"),
        }
    )
    for frame in cached.get("frames") or []:
        yield _sse(frame)
    yield _sse({"type": "done"})


async def _reject_stream(message: str, session_id: str) -> AsyncIterator[str]:
    """Single-frame SSE response for inputs we refuse at the HTTP boundary.

    The seed agent does the same validation inside the agent graph, but
    SequentialAgent doesn't honor `escalate` from sub-agents, so we have
    to short-circuit at the route. Belt + suspenders: any caller that
    somehow bypasses this guard would still hit the agent-level check
    (which falls back to running the recon tools with an empty email,
    a survivable but undesirable state).
    """
    yield _sse({"type": "start", "session_id": session_id})
    yield _sse({"type": "error", "message": message})
    yield _sse({"type": "done"})


@app.post("/api/scan")
@_limiter.limit("5/minute;30/hour")
async def scan(request: Request, req: ScanRequest) -> StreamingResponse:
    session_id = req.session_id or f"scan-{uuid.uuid4()}"
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }

    # Validate at the HTTP boundary. The seed agent re-validates the same
    # input inside the graph, but rejecting here lets us return a clean
    # one-frame SSE response instead of running the full sequence with an
    # empty email after seed's escalate is ignored by SequentialAgent.
    normalized = _validate_email(req.email)
    if normalized is None:
        return StreamingResponse(
            _reject_stream(
                "Please submit a single, plain email address (e.g. user@example.com). "
                "No quotes, no extra text, no special characters.",
                session_id,
            ),
            media_type="text/event-stream",
            headers=headers,
        )

    if req.force_fresh:
        # Drop any existing entry so the upcoming save replaces cleanly.
        cache.clear(normalized)
        cache_status = "forced"
        cached = None
    else:
        cached = cache.load(normalized)
        cache_status = "hit" if cached is not None else "miss"

    logger.info(
        "scan: email=%s ip=%s ua=%r cache=%s",
        normalized,
        _client_ip(request),
        request.headers.get("User-Agent", ""),
        cache_status,
    )

    if cached is not None:
        return StreamingResponse(
            _stream_cached(normalized, session_id, cached),
            media_type="text/event-stream",
            headers=headers,
        )

    return StreamingResponse(
        _stream_fresh(normalized, session_id),
        media_type="text/event-stream",
        headers=headers,
    )


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "agent": root_agent.name}


# Optional single-service mode: serve the built React frontend from the
# same FastAPI process. Cloud Run wants one container, one URL — so the
# deploy pipeline runs `npm run build` and copies frontend/dist/ into
# the image, then sets SERVE_FRONTEND=1. Local dev leaves this unset;
# the React app is served by Vite on :5173 as before.
if os.environ.get("SERVE_FRONTEND") == "1":
    from pathlib import Path

    from fastapi.staticfiles import StaticFiles

    _frontend_dist = Path(
        os.environ.get("FRONTEND_DIST", str(Path(__file__).resolve().parent.parent / "static"))
    )
    if _frontend_dist.is_dir():
        # `html=True` makes StaticFiles serve index.html for directory
        # requests AND for any 404 — the SPA-router fallback we need so
        # a hard-reload on /methodology or /scan/<id> still renders the
        # React app instead of a 404.
        app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
