# Discovery Source Candidates 2026-05-13

This note is sandbox-only. None of these endpoints are approved for production use.

## Current Count

- Raw safe-read endpoint candidates: 27
- Primary business-data candidates: 13 to 14
- Helper or dimension candidates: about 13
- Routes probed: 10
- Routes with only common note endpoints so far: 4

## Best Next Validation Targets

### 1. 异常瑕疵库存

- Route: `pm.abnormalDefectiveInventory.index`
- Useful signal: inventory and risk page with 11 safe-read candidates.
- Candidate endpoints:
  - `/pm/fba_inventory/detail_index?account=${account}&site=${site}&sku=${sku}`
  - `/pm/formal/list?sku=${row.sku}&salesChannel=${row.salesChannel}`
  - `/internalControl/get_internal_audit_group`
  - `/pm/authentication/getQuerySelect`
- Operator value guess: inventory risk, defective stock, SKU-level exception diagnosis.

### 2. 商品搜索表现

- Route: `searchPerformance.productIndex`
- Useful signal: search traffic and product search performance.
- Candidate endpoints:
  - `/searchPerformance/findProductSearchPerformance`
  - `/searchPerformance/getProductDataArray`
  - `/searchPerformance/fileSearchPerformance`
- Skip for now:
  - `/searchPerformance/uploadProductSearchPerformance`
- Operator value guess: keyword/search exposure, ASIN traffic trend, search performance gaps.

### 3. 清仓管理

- Route: `marketing.clearanceStockIndex`
- Useful signal: stock liquidation page with direct read query endpoint.
- Candidate endpoint:
  - `/marketing/getAllClearanceStock`
- Skip for now:
  - `/marketing/batchUpdateClearancesStatus`
  - `/marketing/batchUpdateColumn`
  - `/marketing/updateClearancesData`
  - `/marketing/deleteClearancesData`
  - `/marketing/downLoadClearanceProducts`
- Operator value guess: clearance candidates, stale inventory, promotion/liquidation decisions.

### 4. 销售核心数据

- Route: `product_line.sellerCoreData`
- Useful signal: likely seller/SKU core sales report.
- Candidate endpoints:
  - `/pm/sale/getBySeller`
  - `/pm/sale/advCost?seller_num=${row[row.group_type]}&type=${form.value.time}&business_type=${business_type}`
- Operator value guess: sales baseline, ad cost linkage, seller-level performance diagnosis.

### 5. 产品成功率

- Route: `product_line.sellerSuccess`
- Useful signal: product development/success-rate view.
- Candidate endpoints:
  - `/pm/product/successRate`
  - `/pm/product/sellerSuccess`
  - `/pm/product/successSellerDetailList?start=`
  - `/pm/product/sellerSuccessChart?seller_num=`
- Operator value guess: product development quality, success/failure tracking, team or seller effectiveness.

### 6. 排名销量工具

- Route: `sales_ranking.index`
- Useful signal: clicked safe query and found ranking search endpoint.
- Candidate endpoint:
  - `/pm/formal/salesRankingSearch`
- Operator value guess: rank and estimated sales tracking.

## Not Yet Useful From First Probe

These pages may still be useful, but the first read-only probe only found common note endpoints:

- `activityAnalysisIndex.index` 促销结果分析
- `product_problem.index` 查看产品问题
- `follow_check.index` 跟卖检查
- `profitMargin.compensate.index` FBA费赔偿系统

Next attempt should provide required filters or inspect route-specific XHR after selecting account/site/date, still under `READ_ONLY=1`.

## Current Recommendation

Continue with the isolated discovery path. Promote nothing yet. The next useful step is to validate the top 6 targets one by one until each has:

- a real sanitized response sample,
- inferred fields with confidence,
- a fixture,
- and a separate migration plan for production.
