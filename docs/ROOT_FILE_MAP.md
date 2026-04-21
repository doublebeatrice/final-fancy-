# Root File Map

This map records where root-level files were placed during the cleanup.

## Root Files Kept

| Current path | Purpose |
|---|---|
| `auto_adjust.js` | Main Node automation entry. |
| `package.json` | npm scripts and dependency metadata. |
| `package-lock.json` | Locked dependency versions. |
| `README.md` | Primary project guide. |
| `.mcp.json` | Local Chrome DevTools MCP configuration. |

## Root Directories Kept

| Current path | Purpose |
|---|---|
| `.claude/` | Local assistant/tooling state. Not modified. |
| `extension/` | Current Chrome extension files. |
| `node_modules/` | Installed dependencies. |
| `tests/` | Automated tests. |
| `src/` | Core runtime logic. |
| `data/` | Runtime data, snapshots, logs, history, raw outputs. |
| `docs/` | Documentation and cleanup reports. |
| `scripts/` | One-off/support scripts. |
| `archive/` | Historical versions and inactive files. |

## Core Runtime

| Old path | New path | Notes |
|---|---|---|
| `adjust_lib.js` | `src/adjust_lib.js` | Core bid analysis logic. Required by `auto_adjust.js` and tests. |
| `adjustment_history.json` | `data/adjustment_history.json` | Runtime history used by cooldown checks. |
| `snapshots/` | `data/snapshots/` | Runtime logs, plans, prompts, batch files. |

## Documentation

| Old path | New path |
|---|---|
| `FIELD_DICTIONARY.md` | `docs/FIELD_DICTIONARY.md` |
| `ChatGPT auto1.txt` | `docs/ChatGPT auto1.txt` |
| `【时间切片版】全自动抓取引擎.txt` | `docs/时间切片版_全自动抓取引擎.txt` |

## Data and Output Files

| Old path | New path |
|---|---|
| `solar_terms.json` | `data/solar_terms.json` |
| `solar_term_map.json` | `data/solar_term_map.json` |
| `solr_terms_raw.txt` | `data/solr_terms_raw.txt` |
| `inv_auto_filtered_2026-04-17-02-52-35.csv` | `data/inv_auto_filtered_2026-04-17-02-52-35.csv` |
| `a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` | `data/a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` |
| `限sku.txt` | `data/限sku.txt` |

## Historical Versions

| Old path | New path | Reason |
|---|---|---|
| `adjust_lib_v2_20260417.js` | `archive/history/adjust_lib_v2_20260417.js` | Historical core logic version. |
| `auto_adjust_v2_20260417.js` | `archive/history/auto_adjust_v2_20260417.js` | Historical runner version. |
| `auto_adjust_v2_20260417b.js` | `archive/history/auto_adjust_v2_20260417b.js` | Historical runner version. |
| `extension/panel_v2_20260417.js` | `archive/extension/panel_v2_20260417.js` | Historical extension panel version. |
| `extension/panel_v2_20260417b.js` | `archive/extension/panel_v2_20260417b.js` | Historical extension panel version. |
| `extension/panel.js.bak_20260417` | `archive/extension/panel.js.bak_20260417` | Historical extension panel backup. |

## Scripts

### `scripts/devtools/`

| Old path | New path |
|---|---|
| `capture_iframe.js` | `scripts/devtools/capture_iframe.js` |
| `find_iframe_ctx.js` | `scripts/devtools/find_iframe_ctx.js` |
| `network_capture.js` | `scripts/devtools/network_capture.js` |
| `click_and_capture.js` | `scripts/devtools/click_and_capture.js` |
| `click_query.js` | `scripts/devtools/click_query.js` |
| `layui_trigger.js` | `scripts/devtools/layui_trigger.js` |
| `trigger_fetch_and_check.js` | `scripts/devtools/trigger_fetch_and_check.js` |
| `trigger_iframe.js` | `scripts/devtools/trigger_iframe.js` |
| `test_execute.js` | `scripts/devtools/test_execute.js` |

### `scripts/diagnostics/`

| Old path | New path |
|---|---|
| `check_csv.js` | `scripts/diagnostics/check_csv.js` |
| `check_inv_fields.js` | `scripts/diagnostics/check_inv_fields.js` |
| `check_inv_tab.js` | `scripts/diagnostics/check_inv_tab.js` |
| `check_raw_inv.js` | `scripts/diagnostics/check_raw_inv.js` |
| `diagnose.js` | `scripts/diagnostics/diagnose.js` |
| `sample_dead.js` | `scripts/diagnostics/sample_dead.js` |

### `scripts/generators/`

| Old path | New path |
|---|---|
| `gen_batches.js` | `scripts/generators/gen_batches.js` |
| `gen_prompt.js` | `scripts/generators/gen_prompt.js` |
| `gen_test_plan.js` | `scripts/generators/gen_test_plan.js` |
| `import_plan.js` | `scripts/generators/import_plan.js` |

### `scripts/data-tools/`

| Old path | New path |
|---|---|
| `export.js` | `scripts/data-tools/export.js` |
| `parse_solr_terms.js` | `scripts/data-tools/parse_solr_terms.js` |

## Files Not Moved

No active extension file was moved:

- `extension/manifest.json`
- `extension/background.js`
- `extension/panel.html`
- `extension/panel.js`

These remain in place so Chrome extension loading paths stay unchanged.

