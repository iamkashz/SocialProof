"""Scoring reproducibility eval.

Loads scoring_fixtures.yaml, iterates each row, calls correlate_risk with
the row's inputs, and asserts the resulting score matches within a small
rounding tolerance and the severity band matches exactly.

Run with:
    uv run pytest tests/eval/test_scoring.py -v

Fixtures are hand-crafted to cover:
  - All four severity bands (Low / Moderate / High / Critical)
  - Every category's caps (Credential / Leak / Identity / Attack Surface)
  - The name+location interaction bonus
  - The password-exposure floor rule (both fires and no-op)
  - The primary/secondary decomposition of overlapping account signals
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.osint.correlate import correlate_risk

# Allow +/- 2 score points of drift so we don't fight rounding on log
# functions. Severity is a hard equality check because that's what drives
# the UI's color-coded banner.
_SCORE_TOLERANCE = 2

_FIXTURES_PATH = Path(__file__).parent / "scoring_fixtures.yaml"


def _load_cases() -> list[dict]:
    with _FIXTURES_PATH.open() as f:
        data = yaml.safe_load(f)
    return data.get("cases", [])


def _run_case(inputs: dict) -> dict:
    """Adapt the fixture-shape input to correlate_risk's actual signature.

    Fixtures use explicit boolean/int fields; correlate_risk still takes
    the analyst's flatter shape (exposed_data_classes as a list, etc.),
    so we build the equivalent list-based inputs from counts.
    """
    # Fake exposed_data_classes list from the count. Include "Passwords"
    # first when password_exposed=True so the sensitive-class detector fires.
    n_classes = inputs["exposed_data_class_count"]
    data_classes: list[str] = []
    if inputs.get("password_exposed"):
        data_classes.append("Passwords")
        n_classes = max(0, n_classes - 1)
    data_classes.extend(f"Class{i}" for i in range(n_classes))

    linked = [f"user{i}" for i in range(inputs["linked_username_count"])]

    return correlate_risk(
        email="fixture@example.com",
        summary="",
        breach_count=inputs["breach_count"],
        exposed_data_classes=data_classes,
        public_accounts_found=inputs["public_account_count"],
        real_name_exposed=inputs["real_name_exposed"],
        location_exposed=inputs["location_exposed"],
        linked_usernames=linked,
        paste_hit_count=inputs["paste_hit_count_visible"],
        paste_hit_count_redacted=inputs["paste_hit_count_redacted"],
        account_registration_count=inputs["account_registration_count"],
    )


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
def test_scoring_matches_expected(case: dict) -> None:
    result = _run_case(case["inputs"])
    actual_score = result["risk_score"]
    actual_severity = result["severity"]
    expected_score = case["expected_score"]
    expected_severity = case["expected_severity"]

    delta = abs(actual_score - expected_score)
    assert delta <= _SCORE_TOLERANCE, (
        f"{case['id']}: score {actual_score} outside tolerance of "
        f"{expected_score} +/- {_SCORE_TOLERANCE}. "
        f"category_scores={result.get('category_scores')}. "
        f"description: {case.get('description', '')}"
    )
    assert actual_severity == expected_severity, (
        f"{case['id']}: severity {actual_severity!r} != {expected_severity!r} "
        f"(score={actual_score}). description: {case.get('description', '')}"
    )
