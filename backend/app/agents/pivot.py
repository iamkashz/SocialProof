"""Phase 3 — username pivot loop.

Each iteration:
  1. username_enum_agent  — for each fresh candidate, run user-scanner's
                            username scan (~95 modules across social, dev,
                            creator, community categories) in parallel. All
                            fresh usernames probe concurrently via
                            asyncio.as_completed so the slowest single
                            probe — not their sum — dominates wall-clock.
  2. profile_pivot_agent  — fetch the GitHub profile for each fresh
                            candidate; new profiles may yield more linked
                            usernames (twitter_username, blog handle,
                            alternate logins in commit history). Also runs
                            in parallel.
  3. identity_agent (re-run at top of next iteration via the outer loop's
                            sequential structure) — recomputes candidate
                            set and decides whether to escalate.

The loop is bounded by max_iterations=2. Per-iteration fan-out is
clamped by _MAX_PIVOTS_PER_ROUND so a hallucinating handle-discovery
pass can't explode the work into hundreds of probes.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator

from google.adk.agents import LoopAgent, SequentialAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from app.osint import github_profile_lookup, username_enum_async

from .handle_discovery import handle_discovery_agent
from .identity import make_identity_agent

_MAX_PIVOTS_PER_ROUND = 3  # bound fan-out per loop iteration


def _take_fresh(state: dict) -> list[str]:
    fresh = list(state.get("fresh_usernames") or [])
    return fresh[:_MAX_PIVOTS_PER_ROUND]


def _emit_tool_call(
    ctx: InvocationContext, author: str, call_id: str, name: str, args: dict
) -> Event:
    return Event(
        invocation_id=ctx.invocation_id,
        author=author,
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(id=call_id, name=name, args=args)
                )
            ],
        ),
    )


def _emit_tool_response(
    ctx: InvocationContext, author: str, call_id: str, name: str, response: dict
) -> Event:
    return Event(
        invocation_id=ctx.invocation_id,
        author=author,
        content=types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        id=call_id, name=name, response=response
                    )
                )
            ],
        ),
    )


class UsernameEnumAgent(BaseAgent):
    """Run username_enum against every fresh candidate concurrently.

    All probes are fired in parallel — each fresh username has its own
    async task, and each task's tool_call event is yielded *before* the
    network work starts. Tool_response events are yielded as each task
    completes (via asyncio.as_completed), so the React timeline lights
    up N "Running" cards immediately and ticks them green out of order
    as fastest probes finish first. Previously this loop awaited each
    probe sequentially — 3 usernames at ~15s each was the dominant
    bottleneck in the pivot phase.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = ctx.session.state
        fresh = _take_fresh(dict(state))
        existing: list[dict] = list(state.get("enum_results") or [])
        enumerated: list[str] = list(state.get("enumerated_usernames") or [])

        targets = [u for u in fresh if u not in enumerated]
        if not targets:
            return

        # 1. Fire one tool_call event per username up-front so the UI
        #    shows every probe as "Running" simultaneously, then kick
        #    off the actual network work. Same-tick yield ordering
        #    matters: emit the call event BEFORE creating the task so
        #    the UI sees the spinner before the first byte over the
        #    wire would let it finish.
        per_username: dict[str, str] = {}  # username -> call_id
        for username in targets:
            call_id = f"enum-{uuid.uuid4()}"
            per_username[username] = call_id
            yield _emit_tool_call(
                ctx,
                self.name,
                call_id,
                "username_enum",
                {"username": username},
            )

        # 2. Launch every probe in parallel.
        async def _probe(username: str) -> tuple[str, dict]:
            return username, await username_enum_async(username)

        tasks = [asyncio.create_task(_probe(u)) for u in targets]

        # 3. As each completes, emit its tool_response so the UI ticks
        #    that specific card green. Out-of-order completion is fine —
        #    each event carries its own call_id.
        new_results: list[dict] = []
        for fut in asyncio.as_completed(tasks):
            username, result = await fut
            call_id = per_username[username]
            new_results.append(result)
            enumerated.append(username)
            yield _emit_tool_response(
                ctx, self.name, call_id, "username_enum", result
            )

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            actions=EventActions(
                state_delta={
                    "enum_results": existing + new_results,
                    "enumerated_usernames": enumerated,
                }
            ),
        )


class ProfilePivotAgent(BaseAgent):
    """Fetch GitHub profiles for fresh candidates concurrently.

    Same parallel-emit pattern as UsernameEnumAgent: every probe's
    tool_call event lands up-front so the UI shows N running cards,
    then tool_response events land out-of-order as the profile lookups
    return. github_profile_lookup is sync (httpx.Client), so we wrap
    it in asyncio.to_thread to keep the event loop free for the other
    in-flight pivot tasks.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = ctx.session.state
        fresh = _take_fresh(dict(state))
        profiles: list[dict] = list(state.get("pivot_profiles") or [])
        seen_logins: set[str] = {
            (p.get("profile") or {}).get("login", "").lower() for p in profiles
        }

        targets = [u for u in fresh if u.lower() not in seen_logins]
        if not targets:
            return

        per_username: dict[str, str] = {}
        for username in targets:
            call_id = f"pivot-{uuid.uuid4()}"
            per_username[username] = call_id
            yield _emit_tool_call(
                ctx,
                self.name,
                call_id,
                "github_profile_lookup",
                {"username": username},
            )

        async def _probe(username: str) -> tuple[str, dict]:
            # github_profile_lookup is sync; off-load to a thread so it
            # doesn't block the loop for the other concurrent probes.
            result = await asyncio.to_thread(github_profile_lookup, username)
            return username, result

        tasks = [asyncio.create_task(_probe(u)) for u in targets]

        new_profiles: list[dict] = []
        for fut in asyncio.as_completed(tasks):
            username, result = await fut
            call_id = per_username[username]
            yield _emit_tool_response(
                ctx, self.name, call_id, "github_profile_lookup", result
            )
            if result.get("found"):
                new_profiles.append(result)
                seen_logins.add(username.lower())

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            actions=EventActions(
                state_delta={"pivot_profiles": profiles + new_profiles}
            ),
        )


class PivotGuardAgent(BaseAgent):
    """Escalate (exit loop) when no fresh usernames remain to investigate.

    Without this, the LoopAgent would always run to max_iterations even when
    the first pass exhausted all candidates — wasting two extra rounds of
    HTTP traffic for the common case where a single email maps to one
    identity.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        fresh = ctx.session.state.get("fresh_usernames") or []
        should_stop = not fresh
        actions = EventActions(escalate=True) if should_stop else EventActions()
        message = (
            "Pivot guard: no new usernames — closing investigation."
            if should_stop
            else f"Pivot guard: {len(fresh)} fresh candidate(s) remain — continuing."
        )
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(role="model", parts=[types.Part(text=message)]),
            actions=actions,
        )


username_enum_agent = UsernameEnumAgent(
    name="username_enum_agent",
    description="Probes ~95 public platforms for each freshly-discovered username via user-scanner.",
)

profile_pivot_agent = ProfilePivotAgent(
    name="profile_pivot_agent",
    description="Fetches GitHub profiles for fresh usernames to find more linked handles.",
)

pivot_guard = PivotGuardAgent(
    name="pivot_guard",
    description="Exits the loop when no new candidates were discovered.",
)


# Per-iteration sequence: enumerate → pivot for new linked handles →
# re-aggregate identity → decide whether to keep going.
pivot_step = SequentialAgent(
    name="pivot_step",
    sub_agents=[
        # 1. Probe existing candidates across user-scanner's username
        #    catalog (~95 platforms in social/dev/creator/community).
        username_enum_agent,
        # 2. Fetch GitHub profiles for newly-discovered candidates — may
        #    surface twitter_username, blog, etc. that the identity
        #    aggregator can then pick up.
        profile_pivot_agent,
        # 3. Re-aggregate identity after profile_pivot's new structured
        #    data lands in state.
        make_identity_agent(name="pivot_identity_agent"),
        # 4. LLM-driven prose mining: read breach descriptions, commit
        #    messages, and bios for handles the regex aggregator missed.
        #    Failures here are non-fatal — discovery is bonus signal.
        handle_discovery_agent,
        # 5. Re-aggregate AGAIN so the freshly-discovered handles enter
        #    fresh_usernames; without this the loop guard would think
        #    discovery found nothing new.
        make_identity_agent(name="post_discovery_identity_agent"),
        # 6. Exit the loop if fresh_usernames is empty.
        pivot_guard,
    ],
)


pivot_phase = LoopAgent(
    name="pivot_phase",
    description="Iteratively expands the identity graph by pivoting on new usernames.",
    sub_agents=[pivot_step],
    max_iterations=2,
)
