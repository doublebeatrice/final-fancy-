const assert = require('assert');
const { parseSkuSalesHistoryHtml } = require('../extension/sales_history_parser');

{
  const html = `
    <table>
      <tr><th>Date</th><th>Sales Qty</th><th>Sales Amount</th><th>Order Qty</th></tr>
      <tr><td>2025-04-28</td><td>6</td><td>$120.50</td><td>4</td></tr>
      <tr><td>2026-04-22</td><td>3</td><td>$60</td><td>2</td></tr>
      <tr><td>2025-09-01</td><td>12</td><td>$240</td><td>9</td></tr>
    </table>
  `;
  const result = parseSkuSalesHistoryHtml(html, {
    sku: 'YUT4466',
    asin: 'B0DX5XVDZJ',
    site: 'Amazon.com',
  }, { currentDate: '2026-04-28' });

  assert.strictEqual(result.sku, 'YUT4466');
  assert.strictEqual(result.rows.length, 3);
  assert.strictEqual(result.rows[0].date, '2025-04-28');
  assert.strictEqual(result.rows[0].salesQty, 6);
  assert.strictEqual(result.rows[0].salesAmount, 120.5);
  assert.strictEqual(result.summary.lastYearSamePeriodQty >= 6, true);
  assert.strictEqual(result.summary.historicalPeakMonth, '09');
  assert.ok(!result.parseWarning);
}

{
  const result = parseSkuSalesHistoryHtml('<html><body>No table here</body></html>', {
    sku: 'NO-TABLE',
  }, { currentDate: '2026-04-28' });

  assert.strictEqual(result.rows.length, 0);
  assert.ok(result.parseWarning);
  assert.ok(result.rawHtmlSnippet.includes('No table here'));
}

console.log('sales_history_parser tests passed');
