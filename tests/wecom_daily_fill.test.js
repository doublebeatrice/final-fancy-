const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildWecomFill,
  buildWecomFillRow,
  rowsToTsv,
} = require('../scripts/execute/generate_wecom_daily_fill');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-daily-fill-'));
const rawDir = path.join(root, '5-27');
const salesCoreFile = path.join(rawDir, 'seller_sales_core_7d_2026-05-27.json');
const salesCore30dFile = path.join(rawDir, 'seller_sales_core_30d_2026-05-27.json');
const successRateFile = path.join(rawDir, 'seller_success_rate_HJ17_2026-05-27.json');

writeJson(salesCoreFile, {
  rows: [{
    seller_title: 'total',
    order_sales: '427267.36',
    sale_num: '2877',
    gross_profit: '0.3352',
    net_profit: '0.1938',
    advCost: '0.1114',
    AT: '0.43',
    ACOS: '0.2155',
    order_sales_in_5_month: '41394.97',
    gross_profit_in_5_month: '0.3339',
    net_profit_in_5_month: '0.1761',
    advCost_in_5_month: '0.1278',
    acos_in_5_month: '0.2339',
    qty_yoy_over_1_year: '-0.2445',
  }],
});
writeJson(salesCore30dFile, {
  rows: [{
    seller_title: 'total',
    gross_profit: '0.9999',
    net_profit: '0.9999',
    advCost: '0.9999',
    AT: '0.9999',
    ACOS: '0.9999',
  }],
});
writeJson(successRateFile, {
  successRate: 0.4375,
  successRatePercent: '43.75%',
  targetRow: { total: 16, success: 7, failure: 0, inspect: 9 },
});
{
  const row = buildWecomFillRow({
    date: '2026-05-27',
    rawDir,
    salesCoreFile,
    successRateFile,
  });

  assert.strictEqual(row.values.date, '5月27日');
  assert.strictEqual(row.values.totalGrossProfitRate, '33.52%');
  assert.strictEqual(row.values.totalNetProfitRate, '19.38%');
  assert.strictEqual(row.values.totalAdCostShare, '11.14%');
  assert.strictEqual(row.values.totalAt, '43.00%');
  assert.strictEqual(row.values.totalAcos, '21.55%');
  assert.strictEqual(row.values.new0To5GrossProfitRate, '33.39%');
  assert.strictEqual(row.values.new0To5NetProfitRate, '17.61%');
  assert.strictEqual(row.values.new0To5AdCostShare, '12.78%');
  assert.strictEqual(row.values.new0To5Acos, '23.39%');
  assert.strictEqual(row.values.oldProductYoyDown, '-24.45%');
  assert.strictEqual(row.values.sellerSuccessRate, '43.75%');
  assert.strictEqual(row.source.oldProductYoyDown, 'sales_core.total.qty_yoy_over_1_year');
}

{
  const row = buildWecomFillRow({
    date: '2026-05-27',
    rawDir,
    successRateFile,
  });

  assert.strictEqual(row.values.totalGrossProfitRate, '33.52%');
  assert.strictEqual(path.basename(row.files.salesCore), 'seller_sales_core_7d_2026-05-27.json');
}

{
  const result = buildWecomFill({
    date: '2026-05-27',
    rawDir,
    salesCoreFile,
    successRateFile,
    valuesOnly: true,
  });

  assert.strictEqual(
    result.tsv,
    '33.52%\t19.38%\t11.14%\t43.00%\t21.55%\t33.39%\t17.61%\t12.78%\t23.39%\t-24.45%\t43.75%',
  );
}

{
  const row = buildWecomFillRow({
    date: '2026-05-27',
    rawDir,
    salesCoreFile,
    successRateFile,
    dateFormat: 'iso',
  });

  assert.strictEqual(rowsToTsv([row], { withHeader: true }).split('\n')[0], '日期\t所有产品-毛利率\t所有产品-参考净利\t所有产品-广告占比\t所有产品-AT\t所有产品-ACOS\t0-5个月-毛利润率\t0-5个月-参考净利\t0-5个月-广告占比\t0-5个月-ACOS\t老品下滑\t成功率');
  assert.ok(rowsToTsv([row], { withHeader: true }).includes('2026-05-27\t33.52%'));
}

console.log('wecom_daily_fill tests passed');
