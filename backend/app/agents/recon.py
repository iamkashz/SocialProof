"""Phase 1 — three specialists each query one OSINT source in parallel.

Engineering decision: these are deterministic BaseAgents, not LlmAgents.
Each one calls a single OSINT function with a single argument (the email
from state). An LLM here would just be an expensive function dispatcher —
no reasoning happens — and tripling the model call count per scan would
burn the free-tier quota in 6 scans.

The UI still gets one tool_call + tool_response pair per source because we
synthesize those events inside _run_async_impl. The data shape on the wire
is unchanged from the LlmAgent version.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, Callable

from google.adk.agents import ParallelAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from app.osint import breach_lookup, github_lookup, gravatar_lookup

from .account_enum import account_enum_agent
from .paste import paste_agent


class _ReconAgent(BaseAgent):
    """Run one OSINT function against state['email'] and store the result.

    Emits a synthetic function_call + function_response so the UI's
    agent-timeline keeps rendering one card per source.
    """

    tool_name: str
    state_key: str
    fn: Callable[[str], dict]

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        email = ctx.session.state.get("email") or ""
        call_id = f"recon-{uuid.uuid4()}"

        # Emit a synthetic tool_call so the React UI shows a card immediately.
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call_id, name=self.tool_name, args={"email": email}
                        )
                    )
                ],
            ),
        )

        result = self.fn(email)

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call_id, name=self.tool_name, response=result
                        )
                    )
                ],
            ),
            actions=EventActions(state_delta={self.state_key: result}),
        )


breach_agent = _ReconAgent(
    name="breach_agent",
    description="Queries XposedOrNot for known data breaches exposing the email.",
    tool_name="breach_lookup",
    state_key="breach_result",
    fn=breach_lookup,
)

github_email_agent = _ReconAgent(
    name="github_email_agent",
    description="Searches GitHub commit history for the email to find linked usernames.",
    tool_name="github_lookup",
    state_key="github_result",
    fn=github_lookup,
)

gravatar_agent = _ReconAgent(
    name="gravatar_agent",
    description="Looks up the Gravatar profile for the email address.",
    tool_name="gravatar_lookup",
    state_key="gravatar_result",
    fn=gravatar_lookup,
)


recon_phase = ParallelAgent(
    name="recon_phase",
    description=(
        "Runs breach, GitHub commit-search, Gravatar, IntelX paste/leak, "
        "and user-scanner account-enumeration lookups in parallel."
    ),
    sub_agents=[
        breach_agent,
        github_email_agent,
        gravatar_agent,
        paste_agent,
        account_enum_agent,
    ],
)
