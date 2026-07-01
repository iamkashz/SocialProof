# Evaluation

Two pytest suites that verify SocialProof's deterministic pieces work
as intended and don't regress silently when weights or prompts change.

## Suites

| Suite | File | What it proves |
|---|---|---|
| Scoring reproducibility | `test_scoring.py` (15 cases) | `correlate_risk` produces the expected score + severity across every band, respects the four category caps, honors the password-exposure floor rule, and handles the primary/secondary decomposition of overlapping account signals |
| Narrator output guardrail | `test_narrator_validator.py` (10 cases) | `_filter_narrator_output` catches hallucinated placeholder tokens, backtick-quoted non-state handles, and common confabulated first names — while letting legitimate outputs through unchanged |

## Running

```bash
# From backend/
uv run pytest tests/eval/ -v

# Just one suite
uv run pytest tests/eval/test_scoring.py -v
uv run pytest tests/eval/test_narrator_validator.py -v
```

## Adding cases

- **Scoring**: append a row to `scoring_fixtures.yaml`. Each row has
  `inputs` (raw signal counts + bools), `expected_score` (int), and
  `expected_severity` (one of Low / Moderate / High / Critical). Score
  tolerance is ±2 to absorb log/rounding drift; severity must match
  exactly.
- **Narrator**: append a row to `narrator_fixtures.yaml`. Each row has
  a `state` snapshot (the fields `_build_allowed_token_set` reads), an
  `llm_text` sample response, and the expected `expected_kept` +
  `expected_dropped` section headers + `total_rejections` count.

## Why not full end-to-end eval?

Running the whole agent graph would require mocking IntelX, GitHub,
XposedOrNot, Gravatar, and user-scanner — the LLM adds another layer
of non-determinism on top. That's tracked as future scope. These two
suites cover the pieces that are deterministic today (scoring math,
guardrail rules), which is where regression risk actually lives.

## Legacy ADK eval scaffold

`datasets/` contains the `agents-cli eval` scaffold from project
generation. The two suites above are pytest-based and complementary;
they don't need `agents-cli eval` to run.
