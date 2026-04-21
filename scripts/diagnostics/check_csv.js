const fs = require('fs');
const path = require('path');

const skus = new Set(['43587337061571','294111359277275','428072125021660','160686857899362','284336084748973']);
const content = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'inv_auto_filtered_2026-04-17-02-52-35.csv'), 'utf8');
const lines = content.split('\n');
const headers = lines[0].split(',');

const idx = (name) => headers.indexOf(name);
const iSku = idx('sku');
const iQty30 = idx('qty_30');
const iQty7 = idx('qty_7');
const iFull = idx('fulFillable');
const iDay30 = idx('dynamic_saleday30');
const iNet = idx('net_profit');
const iProfit = idx('profitRate');
const iSea = idx('seaProfitRate');
const iChan = idx('salesChannel');

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const sku = cols[iSku];
  if (skus.has(sku)) {
    console.log(`SKU=${sku} qty_30=${cols[iQty30]} qty_7=${cols[iQty7]} fulFillable=${cols[iFull]} dynamic_saleday30=${cols[iDay30]} net_profit=${cols[iNet]} profitRate=${cols[iProfit]} seaProfitRate=${cols[iSea]} salesChannel=${cols[iChan]}`);
  }
}
