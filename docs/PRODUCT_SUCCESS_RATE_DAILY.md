# Product Success Rate Daily Deposit

This metric is part of the daily Huang Chengzhe data deposit. Do not infer it from sales rows; query the inventory backend success endpoint and preserve the numerator and denominator.

## Source

- Host: `https://sellerinventory.yswg.com.cn`
- Endpoint: `POST /pm/product/sellerSuccess`
- Default seller: `HJ17`
- Required form fields include `sell_dept_groups=HJ`, `seller=HJ17`, `fuldate_min`, and `fuldate_max`.

Use the active logged-in inventory browser session. Never store or hard-code `inventory-token`, `jwt-token`, `x-csrf-token`, cookies, or pasted request headers.

## Date Window Rule

For the daily row, the default query window is:

- `fuldate_min`: previous-previous month last day `00:00:00`
- `fuldate_max`: previous month last day `23:59:59`

Example for business date `2026-05-15`:

- `fuldate_min=2026-03-31 00:00:00`
- `fuldate_max=2026-04-30 23:59:59`

## Command

```powershell
npm run chrome:debug
npm run ops:success-rate -- HJ17
```

Explicit date window:

```powershell
node scripts\execute\fetch_seller_success_rate.js HJ17 2026-03-31 2026-04-30 2026-05-15
```

## Output

The script writes JSON and CSV to:

- `data\snapshots\seller_success_rate_HJ17_<deposit-date>.json`
- `data\snapshots\seller_success_rate_HJ17_<deposit-date>.csv`
- personal trend raw daily folder when that archive exists

The daily table's success rate is:

```text
success_rate = success / total
```

Example response row:

```json
{
  "seller_num": "HJ17",
  "total": 16,
  "success": 6,
  "failure": 0,
  "inspect": 10
}
```

This gives `6 / 16 = 37.50%`.
