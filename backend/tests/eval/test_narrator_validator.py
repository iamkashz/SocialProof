"""Narrator output-validator eval.

Loads narrator_fixtures.yaml, iterates each row, calls
_filter_narrator_output(llm_text, state) and asserts:
  - Every section in `expected_kept` survives in the salvaged text.
  - Every section in `expected_dropped` is absent from the salvage.
  - The total number of rejections matches `total_rejections`.

This proves the guardrail actually catches the specific hallucination
classes it was designed for (placeholder tokens, backtick-quoted
non-state handles, common confabulated first names) and does NOT
over-reject legitimate outputs.

Run with:
    uv run pytest tests/eval/test_narrator_validator.py -v
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.agents.narrator import _filter_narrator_output

_FIXTURES_PATH = Path(__file__).parent / "narrator_fixtures.yaml"


def _load_cases() -> list[dict]:
    with _FIXTURES_PATH.open() as f:
        data = yaml.safe_load(f)
    return data.get("cases", [])


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
def test_narrator_validator_matches_expected(case: dict) -> None:
    salvaged, rejections = _filter_narrator_output(case["llm_text"], case["state"])

    expected_kept: list[str] = case.get("expected_kept", [])
    expected_dropped: list[str] = case.get("expected_dropped", [])
    expected_total: int = case.get("total_rejections", 0)

    # 1. Every "kept" section header should appear in the salvage.
    for header in expected_kept:
        assert header in salvaged, (
            f"{case['id']}: expected section {header!r} to survive but it "
            f"was dropped. salvaged={salvaged!r}"
        )

    # 2. No "dropped" section header should appear in the salvage.
    for header in expected_dropped:
        assert header not in salvaged, (
            f"{case['id']}: expected section {header!r} to be dropped but "
            f"it survived. salvaged={salvaged!r}"
        )

    # 3. Total rejection count matches.
    assert len(rejections) == expected_total, (
        f"{case['id']}: expected {expected_total} rejection(s) but got "
        f"{len(rejections)}: {rejections}"
    )
