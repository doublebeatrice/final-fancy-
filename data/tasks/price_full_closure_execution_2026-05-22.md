# Price Full Closure Execution 2026-05-22

- audit price rows: 99
- executable price applications: 93
- price submitted / already processing: 92
- price direct success markers: 3
- price pending duplicate markers: 89
- price failed: 1
- ad hard-stop pause actions landed: 123
- ad hard-stop pause outcomes: {"success":123}
- non-executable review rows: 6

## Price Failures
- BQ3410: 7.99->8.99; {
    "message": "Server Error"
}

## Review Rows
- FA4843: non_normal_sale; saleStatus=保留页面; highReturn=0
- DON4521: non_normal_sale; saleStatus=保留页面; highReturn=0
- XLN0347: non_normal_sale; saleStatus=保留页面; highReturn=0
- GT3812: high_return_gate; saleStatus=正常销售; highReturn=2
- NEW0005: high_return_gate; saleStatus=正常销售; highReturn=2
- GT3308: high_return_gate; saleStatus=正常销售; highReturn=2

## Files
- schema: `data/snapshots/action_schema_2026-05-22_price_full_closure.json`
- coverage: `data/tasks/price_full_closure_2026-05-22.json`
- execution status: `data/tasks/price_full_closure_execution_status_2026-05-22.json`
- adjustment log: `data/adjustments/adjustments_2026-05-22.json`
