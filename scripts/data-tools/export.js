const WebSocket = require('ws');
const fs = require('fs');
const PANEL_ID = '00093BBA5BA04621255A5D10C0C5F175';
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + PANEL_ID);
function send(msg) { ws.send(JSON.stringify(msg)); }

let allData = [];
let offset = 0;
const BATCH = 50;

ws.on('open', () => {
  send({ id: 1, method: 'Runtime.evaluate', params: {
    returnByValue: true,
    expression: 'STATE.productCards.filter(c => c.adStats && c.adStats["30d"] && c.adStats["30d"].spend > 0).length'
  }});
});

function readBatch() {
  const expr = `
    (function() {
      var cards = STATE.productCards.filter(function(c) { return c.adStats && c.adStats["30d"] && c.adStats["30d"].spend > 0; });
      return cards.slice(${offset}, ${offset + BATCH}).map(function(c) {
        return {
          sku: c.sku, asin: c.asin || null,
          profitRate: c.profitRate || null, invDays: c.invDays || null,
          unitsSold_30d: c.unitsSold_30d || null, unitsSold_7d: c.unitsSold_7d || null,
          note: c.note || null, adStats: c.adStats,
          keywords: c.campaigns.reduce(function(acc, camp) { return acc.concat(camp.keywords); }, [])
            .filter(function(kw) { return kw.stats30d && kw.stats30d.spend > 0; })
            .map(function(kw) { return { id: kw.id, text: kw.text, matchType: kw.matchType, bid: kw.bid, onCooldown: kw.onCooldown, stats30d: kw.stats30d }; }),
          autoTargets: c.campaigns.reduce(function(acc, camp) { return acc.concat(camp.autoTargets); }, [])
            .filter(function(at) { return at.stats30d && at.stats30d.spend > 0; })
            .map(function(at) { return { id: at.id, targetType: at.targetType, bid: at.bid, onCooldown: at.onCooldown, stats30d: at.stats30d }; }),
        };
      });
    })()
  `;
  send({ id: 2, method: 'Runtime.evaluate', params: { returnByValue: true, expression: expr }});
}

ws.on('message', data => {
  const r = JSON.parse(data);
  if (r.id === 1) {
    console.log('有广告花费产品数:', r.result && r.result.result && r.result.result.value);
    readBatch();
  }
  if (r.id === 2) {
    const batch = (r.result && r.result.result && r.result.result.value) || [];
    if (batch.length) {
      allData.push(...batch);
      offset += BATCH;
      console.log('已读取:', allData.length);
      readBatch();
    } else {
      const snap = { exportedAt: new Date().toISOString(), products: allData };
      fs.mkdirSync('D:\\ad-ops-workbench\\snapshots', { recursive: true });
      const fname = 'D:\\ad-ops-workbench\\snapshots\\' + new Date().toISOString().replace(/[:.]/g,'-').slice(0,19) + '.json';
      fs.writeFileSync(fname, JSON.stringify(snap, null, 2));
      console.log('已保存:', fname, '大小:', fs.statSync(fname).size, 'bytes');
      ws.close();
    }
  }
});
ws.on('error', e => console.error(e.message));
