# Raw recovery queue - 2026-05-22

- Status: open
- Raw dir: D:\ad-ops-workbench\黄成喆个人数据趋势\原数据\原日数据\5-22
- Raw recovery items: 3
- Missing raw originals: 3
- Suspicious raw originals: 0
- Same-date candidates: 0
- Stale candidates: 2
- Needs redownload: 3

| Missing class | State | Issues | Expected file | Candidate | Next action |
| --- | --- | --- | --- | --- | --- |
| sales_core_original_xlsx | needs_redownload | missing | table-export*.xlsx, same-date .xlsx, or seller_sales_core_*d_<date>.csv | none | redownload_same_date_original_file |
| inventory_original_csv | stale_candidate_review | missing | inv_auto_filtered_*.csv | inv_auto_filtered_2026-05-16-09-24-30.csv (2026-05-16) | review_stale_candidate_or_redownload_same_date_file |
| ad_full_original_csv | stale_candidate_review | missing | 广告全盘导出_近30天_*.csv or ad_sku_summary_30d_*.csv | 广告全盘导出_近30天_2026-05-16_17-26-21.csv (2026-05-16) | review_stale_candidate_or_redownload_same_date_file |

## Operator actions
- Sales core raw export: Download all selected rows from the sales core data page, or run the seller sales core API raw recovery.
  Completion: A valid matching original file exists in D:\ad-ops-workbench\黄成喆个人数据趋势\原数据\原日数据\5-22 and ops:deposit:status no longer lists sales_core_original_xlsx as missing or suspicious.
- Inventory original CSV: Run the sellerinventory export bookmarklet or equivalent full inventory export.
  Completion: A valid matching original file exists in D:\ad-ops-workbench\黄成喆个人数据趋势\原数据\原日数据\5-22 and ops:deposit:status no longer lists inventory_original_csv as missing or suspicious.
- Ad full export CSV: Run the ad SKU summary full export bookmarklet or equivalent 30-day ad export.
  Completion: A valid matching original file exists in D:\ad-ops-workbench\黄成喆个人数据趋势\原数据\原日数据\5-22 and ops:deposit:status no longer lists ad_full_original_csv as missing or suspicious.
