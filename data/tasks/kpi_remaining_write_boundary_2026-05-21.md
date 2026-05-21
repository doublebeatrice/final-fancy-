# KPI remaining write boundary - 2026-05-21

- Business date: 2026-05-21
- Remaining eligible-looking actions: 9
- Blocked by validation: 1
- Blocked by operation scope: 8
- Needs fresh validation: 0
- Source dry-run: ops_2026-05-20T20-57-06-963Z

| SKU | Action | Entity | ID | Boundary | Reason |
| --- | --- | --- | --- | --- | --- |
| OB3296 | pause | keyword | 122062455586903 | blocked_validation_error | entity id not found in context |
| MH2355 | pause | keyword | 129190313209398 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2355 | pause | keyword | 268853697808740 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2355 | pause | keyword | 145853959137715 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2355 | pause | keyword | 277746857241874 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2355 | pause | keyword | 210523075101870 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2711 | pause | keyword | 48947332097867 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2711 | pause | keyword | 226506195166403 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |
| MH2711 | pause | keyword | 63974424277802 | blocked_out_of_operation_scope | sku_not_in_allowed_operation_scope |

Do not execute these from the broad combined schema. Build a fresh filtered schema and require validationErrors=0, outOfScopeSkus=0, manualReview=0 before any live write.
