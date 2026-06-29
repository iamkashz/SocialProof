"""End-to-end smoke test for the SocialProof ADK service.

Spawns the FastAPI app in-process, POSTs to /api/scan with a known email,
and prints every SSE frame as it arrives. Requires GOOGLE_API_KEY in
app/.env so the model can drive the tool calls.

Usage:
    uv run python scripts/smoke_test.py [email]
"""

from __future__ import annotations

import asyncio
import json
import sys

import httpx
import uvicorn

from app.server import app


async def _stream_scan(email: str) -> None:
    config = uvicorn.Config(app, host="127.0.0.1", port=8081, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    try:
        # Wait for the socket to be ready.
        for _ in range(40):
            await asyncio.sleep(0.05)
            if server.started:
                break

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                "http://127.0.0.1:8081/api/scan",
                json={"email": email},
                headers={"Accept": "text/event-stream"},
            ) as response:
                if response.status_code != 200:
                    print(f"HTTP {response.status_code}")
                    print(await response.aread())
                    return
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    event = json.loads(payload)
                    t = event.get("type")
                    if t == "tool_call":
                        args_preview = json.dumps(event.get("args"))[:80]
                        print(f"→ TOOL CALL  {event['name']}({args_preview})")
                    elif t == "tool_response":
                        out = event.get("output") or {}
                        keys = list(out)[:5] if isinstance(out, dict) else type(out).__name__
                        print(f"← TOOL RESP  {event['name']} keys={keys}")
                    elif t == "text":
                        print(f"  text delta: {event['delta'][:60]!r}")
                    elif t == "final":
                        print(f"\n=== FINAL SUMMARY ===\n{event['text']}\n")
                    elif t == "error":
                        print(f"!! ERROR: {event['message']}")
                    elif t == "done":
                        print("=== done ===")
                    else:
                        print(f"  {t}: {payload[:80]}")
    finally:
        server.should_exit = True
        await task


def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else "test@example.com"
    print(f"Scanning {email} ...\n")
    asyncio.run(_stream_scan(email))


if __name__ == "__main__":
    main()
