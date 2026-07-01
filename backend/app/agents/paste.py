"""Paste-site / leak agent — IntelligenceX integration.

Deterministic BaseAgent that queries IntelX and writes results to
state['paste_result']. Paste titles are deliberately not mined for
usernames — they're too noisy — but hit counts feed the risk score
via the analyst.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from app.osint import paste_search_async


class PasteAgent(BaseAgent):
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        email = ctx.session.state.get("email") or ""
        call_id = f"paste-{uuid.uuid4()}"

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call_id, name="paste_search", args={"email": email}
                        )
                    )
                ],
            ),
        )

        result = await paste_search_async(email)

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call_id, name="paste_search", response=result
                        )
                    )
                ],
            ),
            actions=EventActions(state_delta={"paste_result": result}),
        )


paste_agent = PasteAgent(
    name="paste_agent",
    description=(
        "Queries IntelligenceX paste-site, public-leak, darknet, and dumpster "
        "buckets for any mention of the email. Returns metadata only — never "
        "downloads leak contents."
    ),
)
