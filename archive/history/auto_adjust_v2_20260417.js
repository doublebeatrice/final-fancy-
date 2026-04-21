const WebSocket = require('ws');
const fs = require('fs');
const { log, loadHistory, saveHistory, analyzeCard, PANEL_ID, LOG_FILE, today } = require('./adjust_lib');

async function run() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + PANEL_ID);
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = ms => new Promise(r => setTimeout(r, ms));
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

  log('=== 自动调整开始 ===');

  // 1. 强制全量拉取
  log('拉取全量数据...');
  // 清除旧日志，这样可以精确判断本次是否完成
  await eval_('document.getElementById("log").innerHTML = ""');
  // 清除缓存（保留 kwCapture，避免关键词拦截器超时）
  await eval_('STATE.autoRows = []; STATE.targetRows = [];');
  await eval_('document.getElementById("fetchBtn").click()');
  while (true) {
    await wait(10000);
    const logText = await eval_('document.getElementById("log").innerText');
    if (logText && logText.includes('全量数据就绪')) { log('数据就绪'); break; }
    if (logText && logText.includes('拉取失败')) { log('致命错误: ' + logText.split('\n').slice(-1)[0]); ws.close(); process.exit(1); }
    const last = (logText || '').split('\n').filter(Boolean).slice(-1)[0] || '';
    if (last) log('  ' + last);
  }

  // 2. 读取产品画像和原始数据
  const cards = JSON.parse(await eval_('JSON.stringify(STATE.productCards)') || '[]');
  const allTargetRows = JSON.parse(await eval_('JSON.stringify([...STATE.autoRows, ...STATE.targetRows])') || '[]');
  log('产品画像: ' + cards.length + ' 个，投放目标: ' + allTargetRows.length + ' 条');

  if (cards.length === 0) { log('致命错误: 产品画像为空'); ws.close(); process.exit(1); }

  // 3. 分析生成计划（所有有广告花费的产品）
  const history = loadHistory();
  const plan = [];
  for (const card of cards) {
    if (card.adStats['30d'].spend <= 0) continue;
    const actions = analyzeCard(card, history);
    if (actions.length > 0) plan.push({ sku: card.sku, actions });
  }
  const totalActions = plan.reduce((s, p) => s + p.actions.length, 0);
  log('计划: ' + plan.length + ' 个产品，' + totalActions + ' 个动作');

  // 4. 保存计划文件
  fs.writeFileSync('./snapshots/plan_' + today + '.json', JSON.stringify(plan, null, 2));

  // 5. 执行（每批50条，关键词和自动投放分开）
  const kwItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'keyword').map(a => ({ ...a, sku: p.sku })));
  const atItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'autoTarget').map(a => ({ ...a, sku: p.sku })));

  log('关键词调整: ' + kwItems.length + ' 条，自动投放调整: ' + atItems.length + ' 条');

  const succeededIds = new Set();

  // 关键词需要完整行数据（keywordId/accountId/siteId/campaignId/adGroupId/matchType）
  const kwRows = JSON.parse(await eval_('JSON.stringify(STATE.kwRows.map(r=>({keywordId:r.keywordId,accountId:r.accountId,siteId:r.siteId,campaignId:r.campaignId,adGroupId:r.adGroupId,matchType:r.matchType})))') || '[]');
  const kwMeta = {};
  for (const r of kwRows) kwMeta[String(r.keywordId)] = r;

  // 执行关键词 — 按 accountId 分组，每组再按 BATCH 分批
  let kwOk = 0, kwErr = 0;
  const BATCH = 50;
  const kwByAccount = {};
  for (const x of kwItems) {
    const meta = kwMeta[String(x.id)] || {};
    const acct = String(meta.accountId || 'unknown');
    if (!kwByAccount[acct]) kwByAccount[acct] = { accountId: meta.accountId, siteId: meta.siteId || 4, items: [] };
    kwByAccount[acct].items.push(x);
  }
  let batchNum = 0;
  for (const [acct, group] of Object.entries(kwByAccount)) {
    for (let i = 0; i < group.items.length; i += BATCH) {
      batchNum++;
      const batch = group.items.slice(i, i + BATCH);
      const rows = batch.map(x => {
        const meta = kwMeta[String(x.id)] || {};
        return { keywordId: x.id, bid: x.suggestedBid, siteId: meta.siteId || 4, accountId: meta.accountId, campaignId: meta.campaignId, adGroupId: meta.adGroupId, matchType: meta.matchType };
      });
      const kwPayload = {
        column: 'bid', property: 'keyword', operation: 'bid', manualTargetType: '',
        accountId: group.accountId, siteId: group.siteId,
        idArray: batch.map(x => x.id),
        targetArray: rows,
        targetNewArray: rows,
      };
      const result = await eval_(
        'execAdWrite("/keyword/batchKeyword", ' + JSON.stringify(kwPayload) + ')' +
        '.then(d => JSON.stringify(d)).catch(e => JSON.stringify({code:0, msg: e.message}))',
        true
      );
      try {
        const d = JSON.parse(result || '{}');
        if (d && (d.code === 200 || d.msg === 'success')) {
          kwOk += batch.length;
          batch.forEach(x => succeededIds.add(String(x.id)));
          log('关键词批次 ' + batchNum + ' (账号' + acct + '): 成功 ' + batch.length + ' 条');
        } else {
          kwErr += batch.length;
          log('关键词批次 ' + batchNum + ' (账号' + acct + '): 失败 ' + JSON.stringify(d));
        }
      } catch(e) { kwErr += batch.length; log('关键词批次解析失败: ' + result); }
      await wait(500);
    }
  }

  // 执行自动投放（通过 panel 的 execAdWrite）
  let atOk = 0, atErr = 0;
  for (let i = 0; i < atItems.length; i += BATCH) {
    const batch = atItems.slice(i, i + BATCH);
    const targetArray = batch.map(x => {
      const raw = allTargetRows.find(r => String(r.targetId || r.id || '') === String(x.id)) || {};
      return { siteId: raw.siteId || 4, accountId: raw.accountId, campaignId: raw.campaignId, adGroupId: raw.adGroupId, targetId: x.id, bid: String(x.suggestedBid) };
    });
    const accountId = targetArray[0] && targetArray[0].accountId;
    const siteId = (targetArray[0] && targetArray[0].siteId) || 4;
    const atPayload = {
      column: 'bid', property: 'autoTarget', operation: 'bid',
      accountId, siteId,
      idArray: batch.map(x => x.id),
      campaignIdArray: [...new Set(targetArray.map(t => t.campaignId).filter(Boolean))],
      targetArray, targetNewArray: targetArray,
    };
    const result = await eval_(
      'execAdWrite("/advTarget/batchEditAutoTarget", ' + JSON.stringify(atPayload) + ')' +
      '.then(d => JSON.stringify(d)).catch(e => JSON.stringify({code:0, msg: e.message}))',
      true
    );
    try {
      const d = JSON.parse(result || '{}');
      if (d && (d.code === 200 || d.msg === 'success')) {
        atOk += batch.length;
        batch.forEach(x => succeededIds.add(String(x.id)));
        log('自动投放批次 ' + Math.floor(i/BATCH+1) + ': 成功 ' + batch.length + ' 条');
      } else {
        atErr += batch.length;
        log('自动投放批次 ' + Math.floor(i/BATCH+1) + ': 失败 ' + JSON.stringify(d));
      }
    } catch(e) { atErr += batch.length; log('自动投放批次解析失败: ' + result); }
    await wait(500);
  }

  // 6. 保存历史记录（仅成功的）
  const newHistory = loadHistory();
  for (const p of plan) {
    for (const a of p.actions) {
      if (succeededIds.has(String(a.id))) {
        newHistory.push({ entityId: a.id, sku: p.sku, entityType: a.entityType, date: today, fromBid: a.currentBid, toBid: a.suggestedBid, direction: a.direction, reason: a.reason });
      }
    }
  }
  saveHistory(newHistory);

  log('=== 完成 === 关键词: 成功' + kwOk + '/失败' + kwErr + '  自动投放: 成功' + atOk + '/失败' + atErr);
  ws.close();
}

run().catch(e => { log('致命错误: ' + e.message); process.exit(1); });
