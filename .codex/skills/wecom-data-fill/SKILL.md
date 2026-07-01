---
name: wecom-data-fill
description: Use when working in ad-ops-workbench to generate copy-paste TSV rows for WeCom, WeChat Work, Tencent Docs, online sheets, or business KPI data-entry forms from deposited sales-core data. Trigger on requests like 数据填表, 填表, 企微表格, 在线表格, 表格复制行, 今日数据填表, 每日数据表, 日常 7 天填表, 周一30天数据, 30天填表, WeCom sheet fill, TSV row, values-only, or when the user needs metrics formatted for direct spreadsheet paste rather than a narrative report.
---

# WeCom Data Fill

## Purpose

Generate tab-separated rows that the operator can paste directly into WeCom or online KPI sheets. Prefer this lightweight fill path over a full daily deposit, full snapshot, or HTML regeneration when the user only asks for table-entry values.

Default project root: `D:\ad-ops-workbench`.

## Choose The Fill Mode

**Default path — one command for both today + 30天:**

```powershell
npm run ops:deposit:wecom-now -- --date <YYYY-MM-DD>
```

This auto-detects missing sources (`sales_core_7d`, `sales_core_30d`, `seller_success_rate_HJ17`), lazily runs `chrome:ready` only if the inventory tab probe fails, recovers what's missing, and prints both TSVs (today's row + 30天 row, 30天 默认 `--no-date`). Use `--mode daily` or `--mode 30d` to print just one. Use `--force-recover` to re-pull even when files exist.

Fall back to the lower-level commands below only when the orchestrator can't satisfy the request (custom row preset, custom date format, range, weekly groups).

Use the daily 7-day fill when the user asks for today's data row, daily table values, normal data fill, or `日常 7 天填表`:

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD>
```

If the sheet date/name cells are already filled and the operator will paste starting at the first metric cell:

```powershell
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD> --values-only
```

Current daily 7-day sheet order, pasted from the first metric cell after the name:

```text
所有产品-毛利率
所有产品-参考净利
所有产品-广告占比
所有产品-AT
所有产品-ACOS
0-5个月-毛利润率
0-5个月-参考净利
0-5个月-广告占比
0-5个月-ACOS
老品下滑
成功率
```

For this 7-day header, do not treat the request as a monthly rank table just because it contains `0-5个月`, `参考净利`, `老品下滑`, or `成功率`. It is still the daily 7-day fill when the operator says `日常 7 天填表`, `今天数据填表`, or shares the blue-name row screenshot.

For a daily date range:

```powershell
npm run ops:deposit:wecom-fill -- --from <YYYY-MM-DD> --to <YYYY-MM-DD>
```

Use the 30-day fill when the user says `30天填表`, `周一30天`, `近30天`, `weekly 30d`, or asks for the Monday 30-day account row. Default to `--no-date` so the row starts with the seller name (the sheet already has the date column):

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --no-date
```

If the sheet already has both date and name cells, drop both with `--values-only`:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --values-only
```

If the sheet truly needs the leading date cell, omit both flags:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD>
```

For the 30-day sheet, paste only the metric cells from `销售数量`; do not include date or name when the sheet already has them. The 30-day row order starts:

```text
销售数量, 销售额, 毛利率, 参考净利, 退款率, 广告花费,
所有产品-广告占比, 所有产品-SP, 所有产品-AT, 所有产品-ACOS,
所有产品-CPC, 所有产品-CPS, 所有产品-ROAS,
开售0-3个月-销售额...
```

For weekly group rows, use:

```powershell
npm run ops:deposit:wecom-weekly-30d -- --date <YYYY-MM-DD> --rows hj-group,hj1-group
```

Add `--json` when you need file paths, missing classes, or warnings before deciding whether to recover data.

## Data Sources And Recovery

Most fills should use `ops:deposit:wecom-now` (see above), which handles all recovery in one call. The detail below covers the lower-level fallback path.

Daily fill reads the deposited 7-day sales-core file and HJ17 seller-success file. It maps old-product decline from the total sales-core row's `qty_yoy_over_1_year`; do not borrow that value from SKU review output or another date.

30-day fill reads `seller_sales_core_30d_<YYYY-MM-DD>.json/csv` and HJ17 success-rate data. `/pm/sale/getBySeller` is a rolling 30-day pull, so a file named for an older Monday but exported later is not an exact historical Monday snapshot. Preserve Monday raw 30-day files before filling the sheet.

Never use a 7-day `seller_sales_core_7d_<YYYY-MM-DD>.json/csv` file for a 30-day fill. If the 30-day command reports missing data or shows `seller_sales_core_7d` in `files.salesCore`, recover the 30-day raw file first and rerun before answering.

If a daily fill is missing sales-core data, recover only the needed raw input after backend readiness:

```powershell
npm run chrome:ready
npm run ops:deposit:recover-sales-core -- --date <YYYY-MM-DD>
npm run ops:deposit:wecom-fill -- --date <YYYY-MM-DD> --json
```

If a 30-day fill is missing sales-core data, recover with `--days 30`:

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

Do not silently fabricate values, pull old-product decline from unrelated reports, use 7-day data for 30-day rows, or run `run_today_ops.js --mode full-snapshot` just to answer a fill-table request.
