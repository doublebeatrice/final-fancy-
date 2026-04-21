const fs = require('fs');
const path = require('path');
const { createPanelWs } = require('../../src/adjust_lib');

const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'snapshots', 'test_plan.json'), 'utf8'));

async function run() {
  const ws = await createPanelWs();
  const send = msg => ws.send(JSON.stringify(msg));

  ws.on('open', () => {
    send({ id: 1, method: 'Runtime.evaluate', params: {
      returnByValue: true,
      expression: 'document.getElementById("planTextarea") ? "ready" : "not ready"'
    } });
  });

  ws.on('message', data => {
    const r = JSON.parse(data);
    if (r.id === 1) {
      console.log('面板状态:', r.result && r.result.result && r.result.result.value);
      send({ id: 2, method: 'Runtime.evaluate', params: {
        returnByValue: true,
        awaitPromise: false,
        expression: '(function(plan) { document.getElementById("planTextarea").value = plan; document.getElementById("importBtn").click(); return "imported"; })(' + JSON.stringify(JSON.stringify(plan)) + ')'
      } });
    }
    if (r.id === 2) {
      console.log('导入:', r.result && r.result.result && r.result.result.value);
      setTimeout(() => {
        send({ id: 3, method: 'Runtime.evaluate', params: {
          returnByValue: true,
          expression: 'document.getElementById("log").innerText.slice(-400)'
        } });
      }, 1500);
    }
    if (r.id === 3) {
      console.log('日志:\n' + (r.result && r.result.result && r.result.result.value));
      ws.close();
    }
  });

  ws.on('error', e => console.error(e.message));
}

run().catch(e => { console.error(e.message); process.exit(1); });
