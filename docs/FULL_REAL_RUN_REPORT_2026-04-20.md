# Full Real Run Report - 2026-04-20

## Scope

- Real full-chain run in production environment.
- Included full data fetch, rule evaluation, real ad bid writes, inventory note append, and post-run lookup.
- No temporary throttling, sampling, or protective business-rule changes were added.

## Input Data

- Product cards: 427.
- Planned SKUs: 270.
- Planned actions: 719.
- Planned up-bid actions: 133.
- Planned down-bid actions: 586.
- Planned close/pause actions: 0.
- Planned review-only actions: 0.

## API Execution Result

- API-reported ad success: 664.
- API-reported ad failure: 55.
- Failure reason: backend `403`, message: recent system auto-adjustment blocks manual adjustment.

By type:

- SP keyword: 111 planned, 105 API-reported success, 6 API-reported failure.
- SP auto/target: 417 planned, 368 API-reported success, 49 API-reported failure.
- SB keyword: 188 planned, 188 API-reported success, 0 API-reported failure.
- SB target: 3 planned, 3 API-reported success, 0 API-reported failure.

## Post-Run Bid Lookup

Fresh data was fetched after execution and compared with the planned target bids.

- Actually landed bid changes: 472.
- API success but bid did not land: 192.
- API failure and bid did not land: 55.
- API failure but bid landed: 0.

By type:

- SP keyword: 0 landed, 111 mismatch. This is a blocking engineering issue.
- SP auto/target: 281 landed, 131 mismatch, 5 missing in post-run rows.
- SB keyword: 188 landed, 0 mismatch.
- SB target: 3 landed, 0 mismatch.

## Inventory Note Result

- SKU note append attempts: 270.
- Inventory note success: 256.
- Inventory note failure: 14.
- Failure reason: missing inventory `aid` / inventory record mapping.

Failed note SKUs:

- TH2527
- UY1623
- LM2288
- QUN1382
- OB3296
- OB4139
- RHO1540
- GM4172
- YAN4898
- 9179413058379
- 11325367019821
- YEO1452
- 97540494023288
- 255723187790789

## 20-Sample Verification

Post-run lookup file: `data/snapshots/full_run_verify_result_2026-04-20.json`.

Findings:

- SB keyword samples landed.
- SB target samples landed.
- Most SP auto samples landed, but not all.
- SP keyword samples did not land even when the write API reported success.
- Notes were appended to the correct SKU records for checked samples, and old notes were preserved.
- Current note template does not match the latest requested business format. It still uses the previous `[time]/[SKU]/[stage]` style.
- List-page note lookup did not consistently expose the execution-result field in the exact expected text form, even though note update API returned success for 256 SKUs.

## Final Decision

Conclusion: fix then retest.

Current version is not ready for full rollout.

Blocking engineering issues:

- SP keyword write path returns success but does not persist bid changes.
- SP auto/target write path has partial non-persistence after success.
- Execution history records API success as success without verifying post-write persistence.
- Inventory note failure occurs for SKUs missing `aid`.

Consistency issues:

- Current note template does not match the latest required operations-facing template.
- Some actions can be logged as successful and written into notes/history even when post-run lookup shows the bid did not land.

Strategy issues:

- Current rule set generated no close/pause actions, so the full run did not actually validate close behavior.
- Seasonality/product-stage reasoning is still weak in note output and action strength explanation.
