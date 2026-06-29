"""Account-enumeration agent — user-scanner integration.

A deterministic BaseAgent that runs the community user-scanner OSINT
tool against the email. user-scanner probes ~100 services for
account-existence side channels (signup, password-reset, profile
lookups, etc.) and returns the set of services where the email is
registered.

Follows the same pattern as `paste_agent`: async function call with
synthetic function_call/function_response events so the React UI
keeps rendering one card per OSINT source. Writes to
state['account_enum_result'].

Why a dedicated agent rather than extending the existing recon
agents:
  - user-scanner takes 30-45s on its own and the recon ParallelAgent
    runs everything concurrently, so the new agent's latency overlaps
    with the existing recon sources.
  - The result shape is distinct (a flat list of registered accounts
    rather than per-source structured data) and warrants its own
    state key + scoring rule.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from app.osint import user_scanner_email_lookup_async


class AccountEnumAgent(BaseAgent):
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        email = ctx.session.state.get("email") or ""
        call_id = f"account-enum-{uuid.uuid4()}"

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call_id,
                            name="user_scanner_lookup",
                            args={"email": email},
                        )
                    )
                ],
            ),
        )

        result = await user_scanner_email_lookup_async(email)

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call_id,
                            name="user_scanner_lookup",
                            response=result,
                        )
                    )
                ],
            ),
            actions=EventActions(state_delta={"account_enum_result": result}),
        )


account_enum_agent = AccountEnumAgent(
    name="account_enum_agent",
    description=(
        "Probes ~100 services via user-scanner for account-existence side "
        "channels. Returns the list of platforms where this email is "
        "registered. Skips adult/news/crm/jobs/sports categories."
    ),
)
