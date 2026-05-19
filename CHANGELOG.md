# Changelog

## 2026-05-19

- Completed the 2026-05-19 operating release with low-efficiency cleanup, over-budget productAd waste pauses, controlled over-budget campaign budget lifts, seasonal status tagging, high-efficiency bid review, and daily learning updates.
- Added the `developer-product-inquiry` workflow and durable request archive for forwarded product/developer requests, including concise operator-ready reply handling.
- Added selection ABA search-term and keyword conversion evidence sources for product/keyword judgement while keeping selection data read-only for execution decisions.
- Added seasonal listing-copy guardrails, listing-copy application execution/withdrawal helpers, protected-SKU handling, and season-title action/listing schema generators.
- Added high-efficiency review/execution support, ad-structure opportunity audit, customer-search-term candidate extraction, and off-target keyword audit artifacts.
- Hardened daily operations quality reporting around `dataQuality`, `actionQuality`, `runQuality`, final-run landing, and all-day adjustment attribution.
- Updated Codex runbooks and operating docs for full-loop execution, three-system readiness, product-market evidence, seasonal listing copy, and over-budget/low-efficiency guardrails.

## 2026-05-18

- Added selection-system login readiness and the read-only `ops:selection:keyword-conversion` data source for market keyword conversion evidence.
- Added keyword conversion report fields for coverage, data freshness, market quality, cost risk, multi-strategy CPC/CPA/ACOS, and cross-validation requirements.
- Made backend recovery part of the daily deposit run instead of stopping on the first abnormal preflight.
- Added ad API retry/recovery for HTML, `419`, `Page Expired`, and login-page responses during snapshot export.
- Changed multi-source ad table capture so one noncritical ad subtable failure is recorded without discarding the whole daily snapshot.
- Completed the 2026-05-18 daily deposit with a fresh snapshot, canonical visual HTML, raw CSV layer, seller success rate, task board, proactive audit, and manifest.
- Split `run_today_ops.js` snapshot mode from operation mode so `--execute --mode full-snapshot` preserves full-snapshot capture.
- Removed the silent default 120-listing cap from full-snapshot listing fetch; `AD_OPS_LISTING_FETCH_LIMIT` is now an intentional cap.
- Added `dataQuality`, `actionQuality`, `runQuality`, and `operatingClosure` to daily run/learning outputs so script success cannot be mistaken for a completed operating loop.

## 2026-05-16

- Added the `developer-product-inquiry` Codex skill for forwarded developer/product requests.
- Defined short triggers: `开发诉求` and `开发`.
- Standardized developer-request handling around product-level diagnosis, evidence, execution status, follow-up checkpoints, and human-ready operator replies.
- Added the durable request archive path `data/developer_requests/` for forwarded-message handling records.

## 2026-05-13

- Added the `daily-data-deposit` Codex skill to standardize the daily data deposit workflow.
- Defined the raw input contract for sales core spreadsheets, inventory CSV exports, and ad full export CSVs.
- Documented the detailed HTML archive structure needed for a long-term business database, including SKU pools, ad detail, inventory detail, seasonal context, and learning notes.
- Added release notes for the daily deposit skill and daily reminder workflow.

## 2026-05-06

- Enforced the Codex-only execution boundary: real executable actions now require approved decision metadata, Codex/manual approval, and a Codex/manual action source.
- Blocked generator, rule-generator, and provisional task-board outputs from entering the real execution path without explicit Codex action schema approval.
- Renamed provisional task-board execution semantics to `boardExecutableHint` / `taskBoardSuggestedExecutable` so task priority hints cannot be confused with real execution approval.
- Updated generator scripts to emit candidate/review-only action metadata instead of executable-looking strategy or Codex-like sources.
- Added regression coverage for generator candidates, missing approval metadata, provisional policy sources, and valid Codex-approved schemas.
- Added daily task board, season gap audit, daily learning, adjustment log, and stagnant-inventory rule artifacts to the committed workbench state.
