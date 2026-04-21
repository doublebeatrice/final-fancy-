const { createPanelWs, loadHistory } = require('../../src/adjust_lib');

const month = new Date().getMonth() + 1;
const isQ4 = month >= 10;

const SEASONAL_KEYWORDS = [
  'lab week', 'laboratory week', 'medical lab',
  'nurse', 'nursing', 'nurses week',
  'teacher appreciation', 'teacher week',
  'mother', 'mom', 'prom', 'graduation',
  'dispatcher', 'telecommunicator',
  'memorial day', 'father', 'dad',
];

function isSeasonal(card) {
  const text = [
    card.note || '',
    ...card.campaigns.flatMap(c => c.keywords.map(k => k.text || '')),
    ...card.campaigns.map(c => c.name || ''),
  ].join(' ').toLowerCase();
  return SEASONAL_KEYWORDS.some(kw => text.includes(kw));
}

function getLastDir(history, entityId) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recent = history.filter(h => h.entityId === entityId && h.date >= cutoff);
  return recent.length > 0 ? recent[recent.length - 1].direction : null;
}

async function run() {
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));
  await new Promise(resolve => ws.on('open', resolve));

  const eval_ = (expr, awaitPromise) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const h = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', h); resolve(r.result && r.result.result && r.result.result.value); }
    };
    ws.on('message', h);
    send({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise } });
  });

  const cards = JSON.parse(await eval_('JSON.stringify(STATE.productCards)') || '[]');
  const allTargetRows = JSON.parse(await eval_('JSON.stringify([...STATE.autoRows, ...STATE.targetRows])') || '[]');
  console.log('\n=== 诊断报告 ===');
  console.log(`产品画像总数: ${cards.length}`);
  console.log(`投放目标总数: ${allTargetRows.length}`);

  const history = loadHistory();
  let p_noSpend = 0, p_dead = 0, p_noTarget = 0, p_seasonal = 0, p_lowStock = 0;
  let p_active = 0;
  let e_total = 0, e_noBid = 0, e_zeroSpend = 0;
  let e_0ord_lowSpend = 0, e_0ord_cooldown = 0;
  let e_hasOrd_noTarget = 0, e_hasOrd_midAcos = 0, e_hasOrd_cooldown = 0;
  let e_hasOrd_tinyDiff = 0, e_fire = 0;
  const reasons = {};

  for (const card of cards) {
    if (card.adStats['30d'].spend <= 0) { p_noSpend++; continue; }
    if (card.invDays === 0 && card.unitsSold_30d === 0 && card.adStats['30d'].orders === 0) { p_dead++; continue; }
    p_active++;

    const baseTarget = isQ4
      ? (card.busyNetProfit > 0 ? card.busyNetProfit : card.netProfit)
      : (card.netProfit > 0 ? card.netProfit : 0);
    const effectiveTarget = baseTarget > 0 ? baseTarget : (card.seaProfitRate * 0.5);
    const seasonal = isSeasonal(card);
    const target = seasonal ? effectiveTarget * 1.3 : effectiveTarget;
    const lowStock = card.invDays > 0 && card.invDays <= 2;

    if (target <= 0) p_noTarget++;
    if (seasonal) p_seasonal++;
    if (lowStock) p_lowStock++;

    for (const camp of card.campaigns) {
      const entities = [
        ...camp.keywords.map(k => ({ ...k, entityType: 'keyword' })),
        ...camp.autoTargets.map(a => ({ ...a, entityType: 'autoTarget' })),
      ];
      for (const entity of entities) {
        e_total++;
        if (!entity.id || entity.bid <= 0) { e_noBid++; continue; }

        const lastDir = getLastDir(history, entity.id);
        const { spend, orders, acos } = entity.stats30d || {};
        if (spend == null) { e_zeroSpend++; continue; }

        let newBid = null, reason = '';

        if (orders === 0 && spend > 3) {
          if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.5); reason = '0转化$' + spend.toFixed(2) + '降50%'; }
          else e_0ord_cooldown++;
        } else if (orders === 0 && spend > 0.5) {
          if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.75); reason = '0转化$' + spend.toFixed(2) + '降25%'; }
          else e_0ord_cooldown++;
        } else if (orders === 0) {
          e_0ord_lowSpend++;
        } else if (orders > 0 && acos > 0 && target > 0) {
          if (acos > target * 1.5 && !seasonal) {
            if (lastDir !== 'down') { newBid = Math.max(0.05, entity.bid * 0.8); reason = 'ACOS' + (acos * 100).toFixed(0) + '%超目标降20%'; }
            else e_hasOrd_cooldown++;
          } else if (acos < target * 0.6 && !lowStock) {
            if (lastDir !== 'up') { newBid = Math.min(entity.bid * 1.2, entity.bid + 0.15); reason = 'ACOS' + (acos * 100).toFixed(0) + '%低于目标提20%'; }
            else e_hasOrd_cooldown++;
          } else {
            e_hasOrd_midAcos++;
          }
        } else if (orders > 0 && target <= 0) {
          e_hasOrd_noTarget++;
        } else if (orders > 0 && acos <= 0) {
          e_hasOrd_noTarget++;
        }

        if (newBid && Math.abs(newBid - entity.bid) <= 0.01) {
          e_hasOrd_tinyDiff++;
          newBid = null;
        }

        if (newBid) {
          e_fire++;
          const bucket = reason.split('$')[0].split('%')[0];
          reasons[bucket] = (reasons[bucket] || 0) + 1;
        }
      }
    }
  }

  console.log(`\n--- 产品级过滤 (共 ${cards.length} 个) ---`);
  console.log(`  无广告花费 (30d spend=0): ${p_noSpend}`);
  console.log(`  死品 (invDays=0 & 0销量): ${p_dead}`);
  console.log(`  进入分析: ${p_active}`);
  console.log(`    其中 target=0: ${p_noTarget}`);
  console.log(`    其中季节品: ${p_seasonal}`);
  console.log(`    其中低库存(<=2天): ${p_lowStock}`);

  console.log(`\n--- 实体级过滤 (共 ${e_total} 个关键词+自动投放) ---`);
  console.log(`  无 id 或 bid=0: ${e_noBid}`);
  console.log(`  stats30d 缺失: ${e_zeroSpend}`);
  console.log(`  0转化 spend<=0.5: ${e_0ord_lowSpend}`);
  console.log(`  0转化 spend>0.5 但冷却: ${e_0ord_cooldown}`);
  console.log(`  有转化 target=0: ${e_hasOrd_noTarget}`);
  console.log(`  有转化 ACOS 在可接受区间: ${e_hasOrd_midAcos}`);
  console.log(`  有转化 ACOS 触发但冷却: ${e_hasOrd_cooldown}`);
  console.log(`  bid 变化 < 0.01: ${e_hasOrd_tinyDiff}`);
  console.log(`  最终触发调整: ${e_fire}`);

  console.log('\n--- 触发原因分布 ---');
  for (const [k, v] of Object.entries(reasons)) console.log(`  ${k}: ${v}`);

  console.log('\n--- target=0 产品抽样 (前10个有花费的) ---');
  let sample = 0;
  for (const card of cards) {
    if (card.adStats['30d'].spend <= 0) continue;
    if (card.invDays === 0 && card.unitsSold_30d === 0 && card.adStats['30d'].orders === 0) continue;
    const baseTarget = isQ4
      ? (card.busyNetProfit > 0 ? card.busyNetProfit : card.netProfit)
      : (card.netProfit > 0 ? card.netProfit : 0);
    const effectiveTarget = baseTarget > 0 ? baseTarget : (card.seaProfitRate * 0.5);
    if (effectiveTarget <= 0) {
      console.log(`  SKU=${card.sku} netProfit=${card.netProfit} seaProfitRate=${card.seaProfitRate} busyNetProfit=${card.busyNetProfit} spend30d=${card.adStats['30d'].spend.toFixed(2)}`);
      if (++sample >= 10) break;
    }
  }

  ws.close();
}

run().catch(e => { console.error('错误:', e.message); process.exit(1); });
