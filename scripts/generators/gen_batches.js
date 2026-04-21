const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '..', '..', 'data', 'snapshots');
const data = require(path.join(SNAPSHOTS_DIR, '2026-04-16T13-48-44.json'));
const today = new Date().toISOString().slice(0,10);
const BATCH_SIZE = 50;
const products = data.products;

const header = '你是一位有10年经验的亚马逊运营专家，今天是 ' + today + '。\n' +
'以下是若干产品的广告数据（关键词+自动投放+定位组）及库存数据。\n\n' +
'请对每个产品：\n' +
'1. 判断产品阶段（新品/成熟品/衰退品/节气品）\n' +
'2. 判断当前健康度（盈利/持平/亏损/高风险/Listing异常）\n' +
'3. 给出广告策略方向\n' +
'4. 给出具体调整动作（哪些关键词/自动投放，建议竞价，原因）\n\n' +
'分析时注意：\n' +
'- profitRate: 净利润率；invDays: 库存天数；unitsSold_30d: 近30天销量\n' +
'- onCooldown=true 的实体在冷却期内，仍给建议但在 reason 中注明\n' +
'- 没有库存数据的产品（profitRate=null）只基于广告数据判断\n' +
'- stats30d.acos 已计算好，直接参考\n\n';

const footer = '\n直接返回 JSON 数组，不要 markdown 包裹：\n' +
'[{"sku":"...","asin":"...","stage":"新品|成熟品|衰退品|节气品","health":"盈利|持平|亏损|高风险|Listing异常","listingAlert":null,"strategy":"一句话策略","actions":[{"entityType":"keyword|autoTarget","id":"...","currentBid":0.45,"suggestedBid":0.50,"reason":"..."}],"summary":"2-3句综合判断"}]';

const batches = [];
for (let i = 0; i < products.length; i += BATCH_SIZE) {
  batches.push(products.slice(i, i + BATCH_SIZE));
}

const batchesDir = path.join(SNAPSHOTS_DIR, 'batches');
fs.mkdirSync(batchesDir, { recursive: true });
batches.forEach((batch, i) => {
  const prompt = header + '产品数据（第' + (i+1) + '批，共' + batches.length + '批）：\n' +
    JSON.stringify(batch) + footer;
  const fname = path.join(batchesDir, 'batch_' + String(i+1).padStart(2,'0') + '.txt');
  fs.writeFileSync(fname, prompt);
  console.log('批次', i+1, '/', batches.length, '- 产品数:', batch.length, '- tokens约:', Math.round(prompt.length/4));
});

console.log('\n共', batches.length, '个批次，保存在 snapshots/batches/');
