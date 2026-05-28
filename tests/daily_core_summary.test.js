const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildSummary,
  parseCsv,
  selectSellerRow,
  selectTotalRow,
} = require('../scripts/execute/quick_daily_core_summary');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

{
  const rows = parseCsv('seller_title,order_sales,note\n"total", "1,234.50","a,b"\n');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].seller_title, 'total');
  assert.strictEqual(rows[0].order_sales, ' 1,234.50');
  assert.strictEqual(rows[0].note, 'a,b');
}

{
  const rows = [
    { seller_title: 'total', order_sales: '10' },
    { seller_title: 'HJ17-detail', seller_num: 'HJ17', order_sales: '2' },
    { seller_title: 'HJ17-aggregate', seller_num: 'HJ17', order_sales: '200' },
  ];
  assert.strictEqual(selectTotalRow(rows).order_sales, '10');
  assert.strictEqual(selectSellerRow(rows, 'HJ17').order_sales, '200');
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-core-summary-'));
  const rawDir = path.join(root, '5-25');
  const salesCoreFile = path.join(rawDir, 'seller_sales_core_7d_2026-05-25.json');
  const successRateFile = path.join(rawDir, 'seller_success_rate_HJ17_2026-05-25.json');
  writeJson(salesCoreFile, {
    rows: [
      {
        seller_title: '所选编号汇总',
        order_sales: '471697.22',
        sale_num: '3201',
        gross_profit: '0.3328',
        net_profit: '0.1988',
        advCost: '0.104',
        ACOS: '0.2017',
        refund_percent: '0.0662',
        ROAS: '4.9569',
        order_sales_in_5_month: '42992.22',
        gross_profit_in_5_month: '0.3144',
        net_profit_in_5_month: '0.1587',
        advCost_in_5_month: '0.1258',
        acos_in_5_month: '0.2413',
        at_in_5_month: '0.4892',
      },
      { seller_title: 'HJ17-detail', seller_num: 'HJ17', order_sales: '1000', sale_num: '7' },
      {
        seller_title: 'HJ17-黄成喆',
        seller_num: 'HJ17',
        order_sales: '163056.30',
        sale_num: '1077',
        net_profit: '0.1857',
        refund_percent: '0.0929',
        ACOS: '0.2207',
      },
    ],
  });
  writeJson(successRateFile, {
    successRate: 0.4375,
    successRatePercent: '43.75%',
    targetRow: { total: 16, success: 7, failure: 0, inspect: 9 },
  });

  const summary = buildSummary({
    date: '2026-05-25',
    rawDir,
    salesCoreFile,
    successRateFile,
    startedAt: Date.now(),
  });

  assert.strictEqual(summary.ok, true);
  assert.deepStrictEqual(summary.missing, []);
  assert.strictEqual(summary.totalAccount.sales, 471697.22);
  assert.strictEqual(summary.totalAccount.units, 3201);
  assert.strictEqual(summary.totalAccount.netProfitRate, 0.1988);
  assert.strictEqual(summary.totalAccount.acos, 0.2017);
  assert.strictEqual(summary.newProduct0To5Month.sales, 42992.22);
  assert.strictEqual(summary.newProduct0To5Month.acos, 0.2413);
  assert.strictEqual(summary.sellers.HJ17.sales, 163056.30);
  assert.strictEqual(summary.sellerSuccessRate.percent, '43.75%');
}

console.log('daily_core_summary tests passed');
