const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const DATE = new Date().toISOString().slice(0, 10);
const CSV_PATH = path.join(ROOT, `remaining_sp_7day_untouched_cn_${DATE}.csv`);
const JSON_PATH = path.join(ROOT, `remaining_sp_7day_untouched_cn_${DATE}.json`);
const DELETE_PATTERNS = [
  /^remaining_sp_7day_untouched.*\.(csv|json)$/i,
  /^剩余SP七天未调整清单.*\.(csv|json)$/i,
];

function findPanelId() {
  return new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:9222/json/list', res => {
        let data = '';
        res.on('data', d => {
          data += d;
        });
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            const panel = tabs.find(
              t => t.url && t.url.includes('panel.html') && t.url.includes('chrome-extension')
            );
            if (!panel) {
              reject(new Error('找不到扩展面板页面。请先打开插件面板。'));
              return;
            }
            resolve(panel.id);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function connectWs(panelId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${panelId}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function createClient(ws) {
  let seq = 0;
  const pending = new Map();

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return;
    const ticket = pending.get(msg.id);
    if (!ticket) return;
    pending.delete(msg.id);
    if (msg.error) {
      ticket.reject(new Error(msg.error.message || 'CDP 调用失败'));
      return;
    }
    ticket.resolve(msg.result || {});
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalExpr(expression, awaitPromise = true) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    return result.result ? result.result.value : undefined;
  }

  return { send, evalExpr };
}

function cleanupOldExports() {
  const deleted = [];
  for (const name of fs.readdirSync(ROOT)) {
    if (!DELETE_PATTERNS.some(pattern => pattern.test(name))) continue;
    const full = path.join(ROOT, name);
    fs.rmSync(full, { force: true });
    deleted.push(name);
  }
  return deleted;
}

function reasonText(reason) {
  switch (reason) {
    case 'has_live_rows':
      return '能匹配到执行层，当前仍有可执行对象';
    case 'all_invalid':
      return '能匹配到执行层，但执行对象全部是无效状态';
    case 'no_execution_rows':
      return '七天未调整池里还有，但已经找不到可写执行对象';
    default:
      return reason || '';
  }
}

function quoteCsv(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function idCell(value) {
  const text = value == null ? '' : String(value).trim();
  return text ? `="${text}"` : '';
}

function buildCsv(rows) {
  const headers = [
    '序号',
    'SKU',
    '活动ID',
    '广告组ID',
    '活动名称',
    '广告组名称',
    '投放类型',
    '花费',
    '订单',
    'ACOS',
    '最近手动调整时间',
    '最近广告更新时间',
    '匹配到的执行层对象数',
    '其中可执行对象数',
    '剩余原因',
  ];
  const lines = [headers.map(quoteCsv).join(',')];
  rows.forEach((row, index) => {
    const line = [
      index + 1,
      row.sku || '',
      idCell(row.campaignId),
      idCell(row.adGroupId),
      row.campaignName || '',
      row.groupName || '',
      row.positionType || '',
      row.spend ?? '',
      row.orders ?? '',
      row.acos ?? '',
      row.manualAdjustTheTime || '',
      row.lastAdvUpdatedDate || '',
      row.matchCount ?? 0,
      row.liveCount ?? 0,
      reasonText(row.reason),
    ];
    lines.push(line.map(quoteCsv).join(','));
  });
  return lines.join('\r\n');
}

async function pullRemainingRows(client) {
  const expression = `
    (async () => {
      const invalid = value => {
        const text = String(value ?? '').toUpperCase();
        return /PAUSED|ARCHIVED|DISABLED|ENDED|INCOMPLETE|CAMPAIGN_INCOMPLETE/.test(text) || text === '0' || text === '2';
      };
      const toNum = value => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      if (typeof fetchAllData !== 'function' || typeof fetchSevenDayUntouchedPools !== 'function') {
        throw new Error('面板函数缺失，无法抓取数据。');
      }

      await fetchAllData();
      const untouched = await fetchSevenDayUntouchedPools();
      const spRows = untouched?.spRows || STATE.sp7DayUntouchedRows || [];

      const executionRows = [
        ...(STATE.kwRows || []).map(row => ({ ...row, __entityType: 'keyword' })),
        ...(STATE.autoRows || []).map(row => ({ ...row, __entityType: 'autoTarget' })),
        ...(STATE.targetRows || []).map(row => ({ ...row, __entityType: 'manualTarget' })),
      ];

      return spRows.map(row => {
        const campaignId = String(row.campaignId || '').trim();
        const adGroupId = String(row.adGroupId || '').trim();
        const matched = executionRows.filter(execRow =>
          String(execRow.campaignId || '').trim() === campaignId &&
          String(execRow.adGroupId || '').trim() === adGroupId
        );
        const live = matched.filter(execRow =>
          !invalid(execRow.state || execRow.status || execRow.servingStatus || execRow.campaignState)
        );
        let reason = 'has_live_rows';
        if (!matched.length) reason = 'no_execution_rows';
        else if (!live.length) reason = 'all_invalid';

        return {
          sku: row.sku || '',
          campaignId,
          adGroupId,
          campaignName: row.campaignName || '',
          groupName: row.groupName || '',
          positionType: row.positionType || '',
          spend: toNum(row.Spend ?? row.spend),
          orders: toNum(row.Orders ?? row.orders),
          acos: toNum(row.ACOS ?? row.acos),
          manualAdjustTheTime: row.manualAdjustTheTime || '',
          lastAdvUpdatedDate: row.lastAdvUpdatedDate || row.created_at || '',
          matchCount: matched.length,
          liveCount: live.length,
          reason,
        };
      });
    })()
  `;
  return client.evalExpr(expression, true);
}

async function main() {
  const panelId = await findPanelId();
  const ws = await connectWs(panelId);
  const client = createClient(ws);

  try {
    await client.send('Runtime.enable');
    const deleted = cleanupOldExports();
    const rows = await pullRemainingRows(client);
    rows.sort((a, b) => {
      const rank = { has_live_rows: 0, all_invalid: 1, no_execution_rows: 2 };
      const diff = (rank[a.reason] ?? 9) - (rank[b.reason] ?? 9);
      if (diff !== 0) return diff;
      return String(a.sku || '').localeCompare(String(b.sku || ''));
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.总数 += 1;
        if (row.reason === 'has_live_rows') acc.当前仍有可执行对象 += 1;
        if (row.reason === 'all_invalid') acc.执行层对象全部无效 += 1;
        if (row.reason === 'no_execution_rows') acc.找不到可写执行对象 += 1;
        return acc;
      },
      { 总数: 0, 当前仍有可执行对象: 0, 执行层对象全部无效: 0, 找不到可写执行对象: 0 }
    );

    const csv = buildCsv(rows);
    fs.writeFileSync(CSV_PATH, '\uFEFF' + csv, 'utf8');
    fs.writeFileSync(
      JSON_PATH,
      JSON.stringify(
        {
          导出时间: new Date().toISOString(),
          汇总: summary,
          明细: rows.map(row => ({
            ...row,
            原因说明: reasonText(row.reason),
          })),
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(
      JSON.stringify(
        {
          deleted,
          csv: path.basename(CSV_PATH),
          json: path.basename(JSON_PATH),
          summary,
        },
        null,
        2
      )
    );
  } finally {
    ws.close();
  }
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
