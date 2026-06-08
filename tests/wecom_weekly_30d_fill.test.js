const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildWecomWeekly30dFill,
  rowsToTsv,
} = require('../scripts/execute/generate_wecom_weekly_30d_fill');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-weekly-30d-fill-'));
const rawDir = path.join(root, '5-25');
const salesCoreFile = path.join(rawDir, 'seller_sales_core_30d_2026-05-25.json');
const successRateFile = path.join(rawDir, 'seller_success_rate_HJ17_2026-05-25.json');

writeJson(salesCoreFile, {
  exportedAt: '2026-05-27T04:00:00.000Z',
  date: '2026-05-25',
  days: 30,
  rows: [
    { seller_title: 'HJ大组', gross_profit: '0.3440', net_profit: '0.2257' },
    { seller_title: 'HJ1小组', gross_profit: '0.3427', net_profit: '0.2167' },
    {
      seller_title: '所选编号汇总',
      order_sales: '2498655.58',
      sale_num: '16372',
      gross_profit: '0.3447',
      net_profit: '0.2098',
      refund_percent: '0.0541',
      adv_spend: '247626.1622',
      advCost: '0.0991',
      SP: '0.2875',
      AT: '0.4581',
      ACOS: '0.1838',
      CPC: '2.2085',
      CPS: '14.9511',
      ROAS: '5.4412',
      order_sales_in_3_month: '141251.83',
      gross_profit_in_3_month: '0.3125',
      net_profit_in_3_month: '0.1668',
      advCost_in_3_month: '0.1139',
      sp_in_3_month: '0.3646',
      acos_in_3_month: '0.1715',
      order_sales_in_5_month: '249002.27',
      gross_profit_in_5_month: '0.3269',
      net_profit_in_5_month: '0.1824',
      advCost_in_5_month: '0.1069',
      sp_in_5_month: '0.3271',
      acos_in_5_month: '0.1894',
      at_in_5_month: '0.4699',
      cpc_in_5_month: '2.1346',
      cps_in_5_month: '16.7561',
      order_sales_over_3_month: '2357403.75',
      gross_profit_over_3_month: '0.3467',
      net_profit_over_3_month: '0.2124',
      advCost_over_3_month: '0.0982',
      sp_over_3_month: '0.2833',
      acos_over_3_month: '0.1847',
      order_sales_in_1_year: '458221.48',
      gross_profit_in_1_year: '0.3412',
      net_profit_in_1_year: '0.1777',
      advCost_in_1_year: '0.1072',
      sp_in_1_year: '0.3332',
      acos_in_1_year: '0.1993',
      at_in_1_year: '0.4647',
      cpc_in_1_year: '2.0685',
      cps_in_1_year: '16.8023',
      order_sales_over_1_year: '2040434.10',
      gross_profit_over_1_year: '0.3499',
      net_profit_over_1_year: '0.2171',
      qty_yoy_over_1_year: '-0.171',
      advCost_over_1_year: '0.0973',
      sp_over_1_year: '0.278',
      acos_over_1_year: '0.1803',
      at_over_1_year: '0.4566',
      cpc_over_1_year: '2.2461',
      cps_over_1_year: '14.5212',
    },
  ],
});

writeJson(successRateFile, {
  successRate: 0.4375,
  successRatePercent: '43.75%',
  targetRow: { total: 16, success: 7, failure: 0, inspect: 9 },
});

{
  const result = buildWecomWeekly30dFill({
    date: '2026-05-25',
    rawDir,
    salesCoreFile,
    successRateFile,
  });

  assert.strictEqual(result.rows[0].values.date, '5月25日');
  assert.strictEqual(result.rows[0].values.name, '黄成喆');
  assert.strictEqual(result.rows[0].values.totalUnits, '16,372');
  assert.strictEqual(result.rows[0].values.totalSales, '2,498,655.58');
  assert.strictEqual(result.rows[0].values.totalGrossProfitRate, '34.47%');
  assert.strictEqual(result.rows[0].values.totalNetProfitRate, '20.98%');
  assert.strictEqual(result.rows[0].values.totalRefundRate, '5.41%');
  assert.strictEqual(result.rows[0].values.totalAdCostShare, '9.91%');
  assert.strictEqual(result.rows[0].values.totalSp, '0.29');
  assert.strictEqual(result.rows[0].values.totalAt, '0.46');
  assert.strictEqual(result.rows[0].values.totalAcos, '18.38%');
  assert.strictEqual(result.rows[0].values.new0To3Sales, '141,251.83');
  assert.strictEqual(result.rows[0].values.new0To5GrossProfitRate, '32.69%');
  assert.strictEqual(result.rows[0].values.over3Sales, '2,357,403.75');
  assert.strictEqual(result.rows[0].values.under1YearSales, '458,221.48');
  assert.strictEqual(result.rows[0].values.oldOver1YearYoyGrowth, '-17.10%');
  assert.strictEqual(result.rows[0].values.successRate30To60, '43.75%');
  assert.ok(result.warnings[0].includes('exported at 2026-05-27'));
}

{
  const result = buildWecomWeekly30dFill({
    date: '2026-05-25',
    rawDir,
    salesCoreFile,
    successRateFile,
    valuesOnly: true,
  });

  assert.ok(result.tsv.startsWith('16,372\t2,498,655.58\t34.47%\t20.98%\t5.41%'));
  assert.ok(result.tsv.endsWith('\t43.75%'));
  const cells = result.tsv.split('\t');
  assert.strictEqual(cells.length, 54);
  assert.strictEqual(cells[13], '141,251.83');
  assert.strictEqual(cells[19], '249,002.27');
  assert.strictEqual(cells[20], '32.69%');
  assert.strictEqual(cells[34], '458,221.48');
  assert.strictEqual(cells[35], '34.12%');
  assert.strictEqual(cells[43], '2,040,434.10');
}

{
  const result = buildWecomWeekly30dFill({
    date: '2026-05-25',
    rawDir,
    salesCoreFile,
    successRateFile,
    rows: 'hj-group,hj1-group',
  });

  assert.strictEqual(result.rows.length, 2);
  assert.strictEqual(result.rows[0].values.name, 'HJ组均值');
  assert.strictEqual(result.rows[1].values.name, 'HJ1小组均值');
  assert.strictEqual(result.rows[0].values.successRate30To60, '');
  assert.ok(rowsToTsv(result.rows, { withHeader: true }).startsWith('日期\t姓名'));
}

console.log('wecom_weekly_30d_fill tests passed');
