---
name: wecom-data-fill
description: Use when working in ad-ops-workbench to generate copy-paste rows for WeCom, WeChat Work, Tencent Docs, online sheets, or business KPI data-entry forms from deposited sales-core data. Trigger on Chinese or English requests like 数据填表, 填表, 企微表格, 在线表格, 表格复制行, 今日数据填表, 每日数据行, 周一30天数据, 30天填表, WeCom sheet fill, TSV row, values-only, or when the user needs metrics formatted for direct spreadsheet paste rather than a narrative report.
---

# WeCom Data Fill

## Purpose

Generate tab-separated rows that the operator can paste directly into WeCom or online KPI sheets. Prefer this lightweight fill path over a full daily deposit, full snapshot, or HTML regeneration when the user only asks for table-entry values.

Default project root: `D:\ad-ops-workbench`.

## Choose The Fill Mode

Use the daily fill when the user asks for today's data row, daily table values, or normal "数据填表":

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD>
```

If the sheet date cell is already filled and the operator will paste starting at the first metric cell:

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD> --values-only
```

For a daily date range:

```powershell
npm run ops:deposit:wecom-fill -- --from <YYYY-MM-DD> --to <YYYY-MM-DD>
```

Use the weekly 30-day fill when the user says 周一30天, 近30天, weekly 30d, or asks for the Monday 30-day account row:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD>
```

If the sheet already has the date and name cells:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --values-only
```

For weekly group rows, use:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --rows hj-group,hj1-group
```

Add `--json` when you need file paths, missing classes, or warnings before deciding whether to recover data.

## Data Sources And Recovery

Daily fill reads the deposited 7-day sales-core file and HJ17 seller-success file. It maps old-product decline from the total sales-core row's `qty_yoy_over_1_year`; do not borrow that value from SKU review output or another date.

Weekly 30-day fill reads `seller_sales_core_30d_<YYYY-MM-DD>.json/csv` and HJ17 success-rate data. `/pm/sale/getBySeller` is a rolling 30-day pull, so a file named for an older Monday but exported later is not an exact historical Monday snapshot. Preserve Monday raw 30-day files before filling the sheet.

If a daily fill is missing sales-core data, recover only the needed raw input after backend readiness:

```powershell
npm run chrome:ready
npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD> --json
```

If a weekly 30-day fill is missing sales-core data and the user accepts a current rolling pull for that date, recover with `--days 30`:

```powershell
npm run chrome:ready
node scripts\execute\recover_sales_core_raw.js --date <YYYY-MM-DD> --days 30
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --json
```

If HJ17 success rate is missing, leave that cell blank and say it is missing unless the user asked to recover the full daily deposit.

## Output Rules

Return the copyable TSV as the main answer, preferably in a `tsv` fenced block. Keep any explanation after the row short.

If files are missing or the command returns warnings, include:

- which field class is missing
- whether the row is usable with blanks or blocked
- the exact recovery command already run or recommended

Do not silently fabricate values, pull old-product decline from unrelated reports, or run `run_today_ops.js --mode full-snapshot` just to answer a fill-table request.
