const fs = require('fs');
const path = require('path');
const { createPanelWs } = require('../../src/adjust_lib');

async function run() {
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await new Promise(resolve => ws.on('open', resolve));
  console.log('连接成功');

  const eval_ = (expression, awaitPromise = false) => new Promise(resolve => {
    const id = Math.floor(Math.random() * 100000);
    const handler = data => {
      const r = JSON.parse(data);
      if (r.id === id) { ws.off('message', handler); resolve(r.result?.result?.value); }
    };
    ws.on('message', handler);
    send({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise } });
  });

  console.log('开始拉取数据...');
  await eval_('document.getElementById("fetchBtn").click()');

  let done = false;
  while (!done) {
    await wait(5000);
    const log = await eval_('document.getElementById("log").innerText');
    if (log && log.includes('全量数据就绪')) {
      console.log('数据就绪');
      done = true;
    } else {
      const last = (log || '').split('\n').slice(-2).join(' ');
      console.log('进度:', last);
    }
  }

  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'snapshots', 'test_plan.json'), 'utf8'));
  await eval_('(function(p) { document.getElementById("planTextarea").value = p; document.getElementById("importBtn").click(); })(' + JSON.stringify(JSON.stringify(plan)) + ')');
  await wait(1500);
  const importLog = await eval_('document.getElementById("log").innerText.slice(-200)');
  console.log('导入结果:', importLog.split('\n').slice(-2).join(' '));

  const checkResult = await eval_(`(function() {
    document.querySelectorAll('.action-check').forEach(el => el.checked = false);
    const t = document.querySelector('.action-check[data-id="287230250156375"]');
    if (t) { t.checked = true; return 'found'; }
    return 'not found: ' + [...document.querySelectorAll('.action-check')].map(e => e.dataset.id).join(',');
  })()`);
  console.log('勾选结果:', checkResult);

  await eval_('document.getElementById("executeBtn").click()');
  await wait(8000);
  const execLog = await eval_('document.getElementById("log").innerText.slice(-300)');
  console.log('执行结果:\n', execLog.split('\n').slice(-5).join('\n'));

  ws.close();
}

run().catch(console.error);
