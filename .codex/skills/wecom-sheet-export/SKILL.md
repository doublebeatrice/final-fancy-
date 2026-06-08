---
name: wecom-sheet-export
description: >
  Use when working in ad-ops-workbench to export a Tencent Docs / WeCom (企业微信)
  SPREADSHEET — doc.weixin.qq.com/sheet, docs.qq.com/sheet, or any 腾讯表格/企微表格/
  在线表格 link — to a local .xlsx file. Trigger on Chinese or English requests like
  导出表格, 把这个表格导出, 表格导出, 腾讯表格导出, 企微表格导出, 在线表格抓取,
  表格下载不了, 禁止导出的表格, 导出成 Excel, export this sheet, export Tencent sheet,
  download a WeCom spreadsheet as xlsx, or when the user pastes such a link and wants
  the table data. These sheets render cells to <canvas> (the DOM has no table) and
  lazy-load each sheet only when active, so normal fetch/copy returns nothing; this
  skill reads the spreadsheet engine's in-memory grid over CDP instead. For canvas
  DOCUMENTS (文档, not 表格) use tencent-doc-export instead.
---

# Tencent / WeCom Sheet Export

## Purpose

Export a Tencent Docs / 企业微信 (WeCom) **spreadsheet** (`/sheet/` URL) to a local
`.xlsx`. These sheets paint cells onto a `<canvas>`, so the page DOM holds no table
data, and the cell grid is lazy-loaded one sheet at a time — only the *active* sheet
has data in memory. A plain WebFetch returns just the title; select-all + copy is also
blocked for view-only members.

This skill bypasses both by attaching to the project debug Chrome over the Chrome
DevTools Protocol and reading `window.SpreadsheetApp`'s in-memory cell grid — the same
source the canvas is drawn from — then writing a real `.xlsx` with openpyxl, preserving
each cell's original Excel number format (dates render as 日期, percentages as %).

It does not defeat any server-side access control: you still need an account that can
open the sheet. It is read-only — it never writes anything back to the doc or syncs to
collaborators (see "Hidden sheets" below).

This is the spreadsheet companion to `tencent-doc-export` (which handles canvas-rendered
text documents). Pick by URL: `/sheet/` → this skill, `/doc/` → tencent-doc-export.

Default project root: `D:\ad-ops-workbench`.

## Prerequisites

The export reads from the project debug Chrome on port 9222, which must be logged into
the workspace that owns the sheet (e.g. WeCom / 企业微信 account with access).

```powershell
npm run chrome:ready
```

If the sheet is private and the browser is not signed into a workspace that can open it,
the export will produce no data — sign in first, then re-run.

## How To Run

Two stages: extract the sheets to a JSON intermediate, then build the `.xlsx`.

```powershell
npm run sheet:export -- "<sheetUrl>" --out data\doc_exports\my_sheet.sheets.json --json
npm run sheet:build -- data\doc_exports\my_sheet.sheets.json data\doc_exports\my_sheet.xlsx
```

Stage 1 (`sheet:export`) prints the JSON path; `--json` adds a per-sheet report
(`{ name, status, rows, cols, cells }`). Stage 2 (`sheet:build`) prints the `.xlsx`
path and a per-sheet cell count.

Useful stage-1 flags:

- `--only "每日数据,看板（1）"` — export just these sheets (comma-separated).
- `--skip "账号密码,其他"` — skip these (default skips a sheet named `账号密码` so
  credentials never land on disk in plaintext; pass `--skip ""` to override, not advised).
- `--timeout 24000` — per-sheet load timeout in ms (default 25000). Raise for very large
  sheets on a slow machine.

You can also call the scripts directly:

```powershell
node scripts\execute\export_wecom_sheet.js "<sheetUrl>" --out out.sheets.json --json
python scripts\execute\build_xlsx_from_sheets.py out.sheets.json out.xlsx
```

## Output

- A `.sheets.json` intermediate: `{ docUrl, title, exportedAt, skipped[], sheetOrder[],
  sheets[] }`, each sheet a sparse cell list `{ r, c, v, t, f }` (value, engine type,
  Excel format code). Re-runnable into xlsx without re-extracting.
- A `.xlsx`: one worksheet per source sheet, in tab order, with values, dates,
  percentages, merged cells, and rich text preserved. Sheet titles are sanitized for
  Excel (illegal chars `[]:*?/\` → space, capped at 31 chars, de-duplicated).

Return the `.xlsx` path, the sheet count, and which sheets were skipped. A sheet that
declares many rows but holds few cells is usually genuinely sparse (a dashboard / 看板
with scattered notes), not a truncation — say so rather than re-running.

## Hidden sheets (important, read-only guarantee)

A WeCom sheet often has hidden sub-sheets (state 2) with no clickable tab. The skill
loads them by temporarily unhiding them **in browser memory only**, while a guard
(`commitService.commitMutation` → no-op) blocks every outbound mutation, then re-hides
them at the end. Nothing is ever synced to the server or seen by collaborators; the
doc's hidden/visible layout is restored exactly. The run log prints
`unhid N/N`, `re-hid N/N`, and `commit guard blocked N local mutation(s) (nothing synced)`
as confirmation. If a run is interrupted mid-way, re-running restores state (the model
reads server state, which never changed).

## Failure Handling

- "SpreadsheetApp never exposed a sheet list" / 0 sheets: the page did not finish
  loading, or the debug Chrome is not logged into a workspace that can open the sheet.
  Run `npm run chrome:ready`, confirm the sheet opens in that browser, then retry.
- Debug Chrome not on 9222: start it with `npm run chrome:ready` first.
- Many sheets `load_timeout`: the Chrome window was minimized/backgrounded (the renderer
  throttles and won't load the lazy grid). The script forces `Page.setWebLifecycleState`
  to active, but if it still fails, bring the window to front and re-run.
- Do not fall back to WebFetch (returns only the title) or to select-all + copy (blocked
  by "禁止复制"); both are known dead ends for these canvas sheets. The CDP in-memory grid
  read is the working path.
- `IllegalCharacterError` from the builder is handled (control chars are stripped); if a
  new shape appears, sanitize in `coerce_value`.

## How It Works (for maintenance)

`scripts\execute\export_wecom_sheet.js`:

1. `GET /json/list` on 9222 to find or `PUT /json/new` to open the sheet tab; connect to
   its `webSocketDebuggerUrl`; force `Page.setWebLifecycleState=active`.
2. `window.SpreadsheetApp.workbook.worksheetManager.getSheetNameList()` for the plan and
   `getSheetList()[].getSheetState()` for visible(1)/hidden(2).
3. Install the commit guard, batch-unhide all hidden sheets, then for each sheet: click
   its bottom tab (`.tab-bar-item-container`, CDP `Input.dispatchMouseEvent` — synthetic
   DOM clicks don't switch the sheet) and poll `cellDataGrid.isEmpty()` until it loads.
4. Read the grid in-page via `cellDataGrid.getCellData(r,c)` → `{ value, type,
   style.numberFormat.formatCode, mergeReference }`.
5. Batch re-hide hidden sheets (verify + retry), remove the guard.

`scripts\execute\build_xlsx_from_sheets.py` writes the xlsx with openpyxl, reusing each
cell's `f` as `number_format`, flattening rich-text `{r:[{t}]}` to plain text, and
stripping XML-illegal control chars.

If Tencent renames `window.SpreadsheetApp` or the grid/tab accessors, re-probe the page
globals (`SpreadsheetApp.workbook.worksheetManager`, `.cellDataGrid`, the
`.tab-bar-item-container` tab selector) to find the new accessors and update the `*_FN`
templates. If hidden-sheet handling breaks, re-check `behaviorApi.sheetApi.setSheetState`
and `commitService.commitMutation`.
