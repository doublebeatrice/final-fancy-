# Changelog

## 2026-05-06

- Enforced the Codex-only execution boundary: real executable actions now require approved decision metadata, Codex/manual approval, and a Codex/manual action source.
- Blocked generator, rule-generator, and provisional task-board outputs from entering the real execution path without explicit Codex action schema approval.
- Renamed provisional task-board execution semantics to `boardExecutableHint` / `taskBoardSuggestedExecutable` so task priority hints cannot be confused with real execution approval.
- Updated generator scripts to emit candidate/review-only action metadata instead of executable-looking strategy or Codex-like sources.
- Added regression coverage for generator candidates, missing approval metadata, provisional policy sources, and valid Codex-approved schemas.
- Added daily task board, season gap audit, daily learning, adjustment log, and stagnant-inventory rule artifacts to the committed workbench state.
