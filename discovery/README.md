# Backend Discovery Sandbox

This folder is an isolated, read-only discovery area for exploring data sources in:

- `adv.yswg.com.cn`
- `sellerinventory.yswg.com.cn`

Discovery output is not part of the production ad-ops loop. Nothing in this folder is read by `scripts/run_today_ops.js`, `scripts/execute/export_snapshot.js`, `auto_adjust.js`, `src/ai_decision.js`, or the extension panel production flow.

## Safety Boundary

- Scripts default to `READ_ONLY=1`.
- Scripts write only under `discovery/output/` or `discovery/docs/`.
- Tokens, cookies, authorization headers, and CSRF-like values are redacted before output.
- Scripts must not click write or submission controls such as save, submit, delete, import, batch, create, edit, execute, approval, or rejection actions.
- Any discovered write-like or sensitive page is recorded as a candidate only; it is not integrated into production.

## Workflow

1. Discover visible routes:

   ```powershell
   node discovery\scripts\discover_routes.js
   ```

2. Probe one report page from the route list:

   ```powershell
   node discovery\scripts\probe_report_page.js --route-id searchPerformance.productIndex
   ```

   To click only a safe read button such as query/search/refresh:

   ```powershell
   node discovery\scripts\probe_report_page.js --route-id searchPerformance.productIndex --click-safe-query
   ```

3. Infer field meanings from the probe result:

   ```powershell
   node discovery\scripts\infer_fields.js --input discovery\output\report_probe_<route>_<date>.json
   ```

4. Rank discovered sources by operational value:

   ```powershell
   node discovery\scripts\rank_sources.js
   ```

5. Build a small operator confirmation list:

   ```powershell
   node discovery\scripts\build_questions.js
   ```

6. Validate read-only endpoint candidates with the browser session:

   ```powershell
   node discovery\scripts\validate_endpoint.js --route-id searchPerformance.productIndex
   ```

   This records status, JSON structure, row counts, and field samples only under `discovery/output/`.

## Promotion Rule

A source or field can move into the production workflow only after a separate implementation plan confirms:

- A real page probe exists.
- The saved sample is redacted.
- Field confidence is `A_confirmed`, or the operator has approved a `B_probable` inference.
- A fixture and test cover the field.
- The exact production integration point and rollback path are documented.
