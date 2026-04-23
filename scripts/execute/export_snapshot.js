const fs = require('fs');
const path = require('path');
const { createPanelWs, SNAPSHOTS_DIR } = require('../../src/adjust_lib');

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (_) {
    return fallback;
  }
}

async function main() {
  const outputFile =
    process.argv[2] ||
    process.env.EXPORT_SNAPSHOT_FILE ||
    path.join(SNAPSHOTS_DIR, `panel_snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));

  await new Promise(resolve => ws.on('open', resolve));

  const evalInPanel = (expression, awaitPromise = false) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = data => {
      const response = JSON.parse(data);
      if (response.id !== id) return;
      ws.off('message', handler);
      resolve(response.result && response.result.result && response.result.result.value);
    };
    ws.on('message', handler);
    send({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: !!awaitPromise },
    });
  });

  await evalInPanel('fetchAllData().then(()=>true)', true);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    productCards: parseJson(await evalInPanel('JSON.stringify(STATE.productCards)'), []),
    kwRows: parseJson(await evalInPanel('JSON.stringify(STATE.kwRows)'), []),
    autoRows: parseJson(await evalInPanel('JSON.stringify(STATE.autoRows)'), []),
    targetRows: parseJson(await evalInPanel('JSON.stringify(STATE.targetRows)'), []),
    sbRows: parseJson(await evalInPanel('JSON.stringify(STATE.sbRows)'), []),
    invMap: parseJson(await evalInPanel('JSON.stringify(STATE.invMap || {})'), {}),
    sp7DayUntouchedRows: parseJson(await evalInPanel('JSON.stringify(STATE.sp7DayUntouchedRows || [])'), []),
    sb7DayUntouchedRows: parseJson(await evalInPanel('JSON.stringify(STATE.sb7DayUntouchedRows || [])'), []),
    sevenDayUntouchedMeta: parseJson(await evalInPanel('JSON.stringify(STATE.sevenDayUntouchedMeta || {})'), {}),
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(snapshot, null, 2));
  console.log(outputFile);
  ws.close();
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
