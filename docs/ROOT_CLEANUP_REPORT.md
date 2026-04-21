# Root Cleanup Report

Date: 2026-04-20

## Goal

Clean the repository root without changing business rules or deleting files. The cleanup separates entry points, core logic, output data, historical versions, one-off scripts, and documentation.

## Initial Root Inventory

| File or directory | Classification before cleanup | Decision |
|---|---|---|
| `auto_adjust.js` | Main runtime entry | Keep in root |
| `adjust_lib.js` | Core business logic | Move to `src/adjust_lib.js` |
| `extension/` | Current Chrome extension | Keep in root |
| `tests/` | Test code | Keep in root |
| `package.json` | Project metadata and scripts | Keep in root |
| `package-lock.json` | Dependency lockfile | Keep in root |
| `.mcp.json` | Local MCP config | Keep in root |
| `.claude/` | Local assistant/tooling state | Keep in root, not modified |
| `node_modules/` | Installed dependencies | Keep in root, not modified |
| `README.md` | Project documentation | Keep in root and rewrite |
| `adjustment_history.json` | Runtime history/output | Move to `data/adjustment_history.json` |
| `snapshots/` | Runtime logs, plans, prompt snapshots | Move to `data/snapshots/` |
| `FIELD_DICTIONARY.md` | Documentation | Move to `docs/FIELD_DICTIONARY.md` |
| `ChatGPT auto1.txt` | Historical/reference document | Move to `docs/ChatGPT auto1.txt` |
| `【时间切片版】全自动抓取引擎.txt` | Historical/reference document | Move to `docs/时间切片版_全自动抓取引擎.txt` |
| `auto_adjust_v2_20260417*.js` | Historical entry versions | Move to `archive/history/` |
| `adjust_lib_v2_20260417.js` | Historical core logic version | Move to `archive/history/` |
| `extension/panel_v2_*.js`, `extension/panel.js.bak_20260417` | Historical extension versions | Move to `archive/extension/` |
| `capture_iframe.js`, `find_iframe_ctx.js`, `network_capture.js`, `click_*.js`, `layui_trigger.js`, `trigger_*.js`, `test_execute.js` | DevTools/interactive one-off scripts | Move to `scripts/devtools/` |
| `check_*.js`, `diagnose.js`, `sample_dead.js` | Diagnostic scripts | Move to `scripts/diagnostics/` |
| `gen_*.js`, `import_plan.js` | Prompt/plan generation scripts | Move to `scripts/generators/` |
| `export.js`, `parse_solr_terms.js` | Data utility scripts | Move to `scripts/data-tools/` |
| `solar_terms.json`, `solar_term_map.json`, `solr_terms_raw.txt` | Data files | Move to `data/` |
| `inv_auto_filtered_2026-04-17-02-52-35.csv` | Output/sample data | Move to `data/` |
| `a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` | Image/data artifact | Move to `data/` |
| `限sku.txt` | Data/reference list | Move to `data/` |

## Directories Created

- `docs/`
- `data/`
- `scripts/`
- `scripts/devtools/`
- `scripts/diagnostics/`
- `scripts/generators/`
- `scripts/data-tools/`
- `src/`
- `archive/`
- `archive/history/`
- `archive/extension/`
- `archive/unknown/`

`archive/unknown/` was created for future unknown files, but no file was placed there in this cleanup.

## Files Moved

### Current Runtime/Core

- `adjust_lib.js` -> `src/adjust_lib.js`
- `adjustment_history.json` -> `data/adjustment_history.json`
- `snapshots/` -> `data/snapshots/`

### Documentation

- `FIELD_DICTIONARY.md` -> `docs/FIELD_DICTIONARY.md`
- `ChatGPT auto1.txt` -> `docs/ChatGPT auto1.txt`
- `【时间切片版】全自动抓取引擎.txt` -> `docs/时间切片版_全自动抓取引擎.txt`

### Data and Outputs

- `solar_terms.json` -> `data/solar_terms.json`
- `solar_term_map.json` -> `data/solar_term_map.json`
- `solr_terms_raw.txt` -> `data/solr_terms_raw.txt`
- `inv_auto_filtered_2026-04-17-02-52-35.csv` -> `data/inv_auto_filtered_2026-04-17-02-52-35.csv`
- `a8070a0f-0570-4d04-97c8-d4c82d9968d6.png` -> `data/a8070a0f-0570-4d04-97c8-d4c82d9968d6.png`
- `限sku.txt` -> `data/限sku.txt`

### Historical Versions

- `adjust_lib_v2_20260417.js` -> `archive/history/adjust_lib_v2_20260417.js`
- `auto_adjust_v2_20260417.js` -> `archive/history/auto_adjust_v2_20260417.js`
- `auto_adjust_v2_20260417b.js` -> `archive/history/auto_adjust_v2_20260417b.js`
- `extension/panel_v2_20260417.js` -> `archive/extension/panel_v2_20260417.js`
- `extension/panel_v2_20260417b.js` -> `archive/extension/panel_v2_20260417b.js`
- `extension/panel.js.bak_20260417` -> `archive/extension/panel.js.bak_20260417`

### One-off and Support Scripts

- DevTools scripts -> `scripts/devtools/`
- Diagnostic scripts -> `scripts/diagnostics/`
- Prompt/plan generators -> `scripts/generators/`
- Data utility scripts -> `scripts/data-tools/`

See `docs/ROOT_FILE_MAP.md` for the full map.

## References Updated

- `auto_adjust.js`
  - `require('./adjust_lib')` -> `require('./src/adjust_lib')`
  - Plan output path now uses exported `SNAPSHOTS_DIR`.
- `src/adjust_lib.js`
  - History path changed from root `adjustment_history.json` to `data/adjustment_history.json`.
  - Snapshot/log path changed from root `snapshots/` to `data/snapshots/`.
  - Exports `SNAPSHOTS_DIR` for the main entry.
- `tests/adjust_lib.test.js`
  - `require('../adjust_lib')` -> `require('../src/adjust_lib')`.
- `scripts/generators/gen_prompt.js`
  - Snapshot input/output paths changed to `data/snapshots/`.
- `scripts/generators/gen_batches.js`
  - Snapshot input/output paths changed to `data/snapshots/`.
- `scripts/generators/gen_test_plan.js`
  - Test plan output changed to `data/snapshots/test_plan.json`.
- `scripts/generators/import_plan.js`
  - Test plan input changed to `data/snapshots/test_plan.json`.
- `scripts/devtools/test_execute.js`
  - Test plan input changed to `data/snapshots/test_plan.json`.
- `scripts/diagnostics/check_csv.js`
  - CSV path changed to `data/inv_auto_filtered_2026-04-17-02-52-35.csv`.
- `README.md`
  - Rewritten to describe the current workflow, layout, entries, outputs, and test commands.

## Files Left in Root

- `auto_adjust.js`: main CLI/runtime entry.
- `package.json`, `package-lock.json`: Node project metadata.
- `README.md`: primary project documentation.
- `.mcp.json`: local Chrome DevTools MCP configuration.
- `.claude/`: local assistant/tooling state, not modified.
- `extension/`: current Chrome extension package, root-relative load path is convenient for Chrome.
- `src/`: core logic.
- `tests/`: automated tests.
- `data/`: runtime data and outputs.
- `docs/`: documentation.
- `scripts/`: helper scripts.
- `archive/`: historical files.
- `node_modules/`: installed dependencies.

## Unknown or Unverified Files

No file was deleted. No file was placed in `archive/unknown/` because each moved file had a plausible category. Some scripts in `scripts/` remain one-off utilities and were not fully functionally tested.

## Business Rules

No bid adjustment business rule was intentionally changed during this cleanup.

## Verification Performed

The following checks passed after the cleanup:

- `node --check auto_adjust.js`
- `node --check src\adjust_lib.js`
- `node --check extension\panel.js`
- `npm.cmd test`
- `node -e "const m=require('./src/adjust_lib'); ..."` confirmed `SNAPSHOTS_DIR` points to `data/snapshots`.
- `Test-Path` confirmed these paths exist:
  - `data/snapshots`
  - `data/adjustment_history.json`
  - `extension/manifest.json`
  - `extension/panel.html`
  - `extension/panel.js`

Not run: `node auto_adjust.js`, because it can trigger real bid writes when the browser and panel are ready.
