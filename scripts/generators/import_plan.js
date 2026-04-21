const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'snapshots', 'test_plan.json'), 'utf8'));
const PANEL_ID = '00093BBA5BA04621255A5D10C0C5F175';
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + PANEL_ID);
function send(msg) { ws.send(JSON.stringify(msg)); }

ws.on('open', () => {
  // 用 Runtime.callFunctionOn 避免字符串转义问题
  send({ id: 1, method: 'Runtime.evaluate', params: {
    returnByValue: true,
    expression: 'document.getElementById("planTextarea") ? "ready" : "not ready"'
  }});
});

ws.on('message', data => {
  const r = JSON.parse(data);
  if (r.id === 1) {
    console.log('面板状态:', r.result && r.result.result && r.result.result.value);
    // 用 CDP 直接设置值
    send({ id: 2, method: 'Runtime.evaluate', params: {
      returnByValue: true,
      awaitPromise: false,
      expression: '(function(plan) { document.getElementById("planTextarea").value = plan; document.getElementById("importBtn").click(); return "imported"; })(' + JSON.stringify(JSON.stringify(plan)) + ')'
    }});
  }
  if (r.id === 2) {
    console.log('导入:', r.result && r.result.result && r.result.result.value);
    setTimeout(() => {
      send({ id: 3, method: 'Runtime.evaluate', params: {
        returnByValue: true,
        expression: 'document.getElementById("log").innerText.slice(-400)'
      }});
    }, 1500);
  }
  if (r.id === 3) {
    console.log('日志:\n' + (r.result && r.result.result && r.result.result.value));
    ws.close();
  }
});
ws.on('error', e => console.error(e.message));
