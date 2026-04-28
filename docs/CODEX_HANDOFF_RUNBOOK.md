# Codex Handoff Runbook

This document is the handoff guide for running the project from a different Codex account or a new session.

## What Transfers

The repo transfers:

- Data capture scripts.
- Snapshot export.
- Action schema validation.
- Execution scripts.
- Verification and summary output.
- Inventory note append flow.
- Q2 operating priorities documented in `docs/Q2_AD_OPS_PLAYBOOK.md`.

The repo does not transfer:

- Browser login cookies.
- Chrome extension installation state.
- The active Chrome debug session.
- The current chat memory.

That means a new Codex account can run the workflow if the same machine has the browser profile logged in and the extension available.

## Required Read Order

1. `README.md`
2. `AGENT.md`
3. `docs/CODEX_AI_BOUNDARY.md`
4. `docs/Q2_AD_OPS_PLAYBOOK.md`
5. `docs/CODEX_MINIMAL_CLOSED_LOOP.md`

## Start Browser Session

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser.ps1
```

Then confirm these pages are logged in:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
```

The operator must manually check and confirm the login state after these pages open. This is required every time a fresh browser session is started. Do not proceed to snapshot export until both systems are visibly logged in.

Open the extension panel:

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

If the extension ID changes on another machine, use the installed extension panel URL from Chrome instead of the URL above.

## Export Snapshot

```powershell
node scripts\execute\export_snapshot.js data\snapshots\latest_snapshot.json
```

Expected output is a JSON snapshot containing panel cards, SP rows, SB rows, seven-day untouched pools, and inventory note context.

## Read Path Selection

Do not use full snapshot export as the default for a named SKU. Choose the smallest read path that answers the question:

- Named SKU overall health: `node scripts\execute\fetch_ad_sku_summary.js <siteId> <days> <SKU>`; this calls `/product/adSkuSummary` and returns SKU-level spend, sales, orders, ACOS, CPC, clicks/impressions, previous-period deltas, and inventory snippet.
- Named SKU traffic trend confirmation: call `POST /product/chart` inside the logged-in `adv` session when the business question is "should this SKU push harder now?" This is now a formal evidence source for `impressions` and `clicks` absolute-value trend, especially for seasonal or holiday SKUs where the right action depends on whether traffic is falling during the sell-through window.
- Named SKU ad breakdown: `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <days>` or `node scripts\execute\fetch_sku_ad_product_data.js <SKU> <siteId> <startYmd> <endYmd>`; this calls `/product/adProductData` and returns campaign/adGroup/product-ad rows for the SKU, including campaign budget fields such as `dailyBudget` when present.
- Specific ad group rows across SP/SB: `node scripts\execute\fetch_ad_group_rows.js <campaignId> <adGroupId> <accountId> <siteId> <property> <tableName|-> <days|startYmd> [endYmd]`; this calls `/keyword/findAllNew` and locally filters by `campaignId + adGroupId`. Use `property=1` for SP keyword, `2 product_target` for SP auto, `3 product_manual_target` for SP manual target, `4` for SB keyword, and `6` for SB target.
- Specific campaign placement: `node scripts\execute\fetch_campaign_placement.js <campaignId> <accountId> <siteId> <days|startYmd> [endYmd]`; this calls `/placement/findAllPlacement` and returns placement percent plus spend/orders/sales/CPC/CVR/ACOS/ROAS by placement.
- Specific SP ad group internals: `node scripts\execute\fetch_sp_group_detail.js <campaignId> <adGroupId> <accountId> <siteId> <days|startYmd> [endYmd]`; this calls `/advTarget/findManualProductTarget` for ASIN/manual product targets and `/customerSearch/targetFindAll` for customer search terms.
- Customer search terms from `/customerSearch/targetFindAll` are useful for SP auto/manual groups. SB and some SP keyword groups may return only an empty aggregate placeholder.
- Full abnormal pool, daily down pool, eligible SKU discovery, or cross-SKU prioritization: export a full snapshot.

Pick the date range from the business question. Use recent 7/30 days for current health and explicit dates for historical comparison.

Use `/product/chart` before deciding strong push vs strong cut in these cases:

- Seasonal SKUs in an active sell season.
- SKUs where the operator says "this should be pushed harder now".
- Cases where ACOS alone suggests cut, but the real issue may be falling impressions/clicks.
- Cases where sales are down and you must distinguish `traffic loss` from `conversion loss`.

Minimum judgment rule:

- If season is active, inventory is sufficient, and `/product/chart` shows impressions/clicks absolute values falling, treat `traffic recovery / push` as a live candidate.
- Do not rely only on old note history such as previous `downbid` records to decide today's action.
- Historical note actions are context only; current-season traffic trend has higher priority.

Never save pasted `x-xsrf-token` values. These read scripts run inside the logged-in `adv.yswg.com.cn` debug tab and use the browser session.

SP budget and SP placement writes are automatic-execution capable after schema validation. Budget uses action schema `entityType=campaign`, `actionType=budget`, `suggestedBudget` and writes through `PATCH /campaign/batchCampaign`. Placement uses `entityType=campaign`, `actionType=placement`, `placementKey`, `suggestedPlacementPercent` and writes through `PATCH /campaign/editCampaignColumn`.

Inventory listing performance is part of the AI context: `session_7/14/21` are last-week / two-weeks-ago / three-weeks-ago sessions, and `percentage_7/14/21` are the matching listing conversion rates.

## Codex Decision Step

Codex reads the snapshot and Q2 playbook, then writes an action schema JSON. The schema is the only decision artifact. The executor must not invent actions.

Low-risk auto-executable actions currently allowed:

- `bid_up`
- `bid_down`
- `enable`
- `pause`
- Seven-day untouched low-risk touch actions
- low-budget SP `create` when backed by inventory, margin, Q2/seasonal timing, low impressions/clicks, stuck-stock risk, or old-product recovery evidence

Review-only actions:

- SB `create` until the real SB creation interface is captured and verified
- `structure_fix`
- large bid changes
- listing changes
- price changes
- replenishment decisions

## Dry Run

```powershell
$env:DRY_RUN='1'
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Dry-run must show validation errors as structured failures. Do not execute if schema validation is not clean.

## Execute

```powershell
Remove-Item Env:\DRY_RUN -ErrorAction SilentlyContinue
node scripts\execute\run_actions.js data\snapshots\action_schema.json --snapshot data\snapshots\latest_snapshot.json
```

Expected outputs are written under `data/snapshots/`, including verification and execution summary files.

## Troubleshooting

If export fails:

- Confirm debug Chrome is running on port `9222`.
- Confirm the extension panel is open.
- Confirm ad and inventory systems were manually opened and login was confirmed by the operator.
- If the snapshot has inventory rows but zero ad rows, reopen `adv.yswg.com.cn`, confirm login, refresh the extension panel, and export again.

If execution fails with missing auth:

- Reopen debug Chrome with the normal user data directory.
- Refresh the ad system page.
- Refresh the extension panel.

If note writing fails:

- Confirm inventory site is logged in.
- Re-run with the same schema and snapshot only after checking the failure is note-only.

If verification does not land:

- Check whether the backend returned success but the row refresh did not include the updated entity.
- Use the generated verification file before retrying.

If an API returns 403 with recent-system-adjust language:

- Treat it as a structured block, not a retryable execution failure.
- Do not loop on it.
