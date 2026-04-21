# Inventory Note Write Console Snippets

以下脚本必须在 `https://sellerinventory.yswg.com.cn` 已登录页面的浏览器 Console 执行。

## 单条新增 / 覆盖

```js
(async function singleSetInventoryNote() {
  const input = {
    aid: '填写库存记录aid',
    sku: '填写SKU',
    noteText: `[时间] 2026-04-20 15:32:10
[SKU] GM3149
[阶段] 复活节高峰后，进入尾声阶段
[判断] 当前广告花费偏高，转化承接一般，节后继续强推意义下降；平时仍有少量自然流量
[策略] 本次按偏温和降投处理，不直接重砍，先控花费并保留基础流量
[动作] SP 关键词组 bid -15%
[目标] 降低无效花费，观察降投后是否还能保住自然和少量广告单
[后续观察] 重点看未来3天点击、7天订单、ACOS是否回落
[下次机会] 近期无明显大节点，先按平时流量逻辑运营
[执行结果] 成功
[原因] 无`,
  };

  const token =
    document.querySelector('meta[name="csrf-token"]')?.content ||
    document.querySelector('input[name="_token"]')?.value ||
    window.Laravel?.csrfToken ||
    document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
    '';

  const body = new URLSearchParams({
    type: 'note',
    aid: input.aid,
    sku: input.sku,
    value: input.noteText,
    current_value: input.noteText,
  });

  const res = await fetch('https://sellerinventory.yswg.com.cn/pm/formal/update', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'x-csrf-token': decodeURIComponent(token),
      'x-requested-with': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => null);
  console.log('[single-set] HTTP状态', res.status);
  console.log('[single-set] 返回JSON', json);
  console.log('[single-set] value/current_value', { value: input.noteText, current_value: input.noteText });
  console.log('[single-set] encoded body', body.toString());
})();
```

## 单条追加

```js
(async function singleAppendInventoryNote() {
  const input = {
    aid: '填写库存记录aid',
    sku: '填写SKU',
    oldNote: `这里填追加前已经存在的完整旧便签`,
    appendText: `[时间] 2026-04-20 15:32:10
[SKU] GM3149
[阶段] 复活节高峰后
[判断] 当前花费偏高，转化承接一般
[策略] 偏温和降投，先控花费
[动作] SP 关键词组 bid -15%
[目标] 降低无效花费
[后续观察] 看3天点击、7天订单、ACOS
[下次机会] 暂无明显节点，按平时流量处理
[执行结果] 失败
[原因] 返回 code/msg = xxx`,
  };

  const token =
    document.querySelector('meta[name="csrf-token"]')?.content ||
    document.querySelector('input[name="_token"]')?.value ||
    window.Laravel?.csrfToken ||
    document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
    '';
  const appendText = input.oldNote ? `\n\n${input.appendText}` : input.appendText;
  const finalNote = input.oldNote + appendText;

  const body = new URLSearchParams({
    type: 'note',
    aid: input.aid,
    sku: input.sku,
    value: appendText,
    current_value: finalNote,
  });

  const res = await fetch('https://sellerinventory.yswg.com.cn/pm/formal/update', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'x-csrf-token': decodeURIComponent(token),
      'x-requested-with': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => null);
  console.log('[single-append] HTTP状态', res.status);
  console.log('[single-append] 返回JSON', json);
  console.log('[single-append] 关键变量', { oldNote: input.oldNote, appendText, finalNote });
  console.log('[single-append] encoded body', body.toString());
})();
```

## 批量新增 / 覆盖

```js
(async function batchSetInventoryNotes() {
  const rows = [
    { aid: 'aid1', sku: 'SKU1', noteText: '完整新便签1' },
    { aid: 'aid2', sku: 'SKU2', noteText: '完整新便签2' },
  ];

  async function updateOne(row) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const body = new URLSearchParams({ type: 'note', aid: row.aid, sku: row.sku, value: row.noteText, current_value: row.noteText });
    const res = await fetch('https://sellerinventory.yswg.com.cn/pm/formal/update', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-csrf-token': decodeURIComponent(token), 'x-requested-with': 'XMLHttpRequest' },
      body: body.toString(),
    });
    const json = await res.json().catch(() => null);
    console.log('[batch-set]', row.sku, { httpStatus: res.status, json, value: row.noteText, current_value: row.noteText, body: body.toString() });
    return { sku: row.sku, httpStatus: res.status, json };
  }

  console.log('[batch-set] results', await Promise.all(rows.map(updateOne)));
})();
```

## 批量追加

```js
(async function batchAppendInventoryNotes() {
  const rows = [
    { aid: 'aid1', sku: 'SKU1', oldNote: '旧便签1', appendText: '本次新增片段1' },
    { aid: 'aid2', sku: 'SKU2', oldNote: '旧便签2', appendText: '本次新增片段2' },
  ];

  async function appendOne(row) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const appendText = row.oldNote ? `\n\n${row.appendText}` : row.appendText;
    const finalNote = row.oldNote + appendText;
    const body = new URLSearchParams({ type: 'note', aid: row.aid, sku: row.sku, value: appendText, current_value: finalNote });
    const res = await fetch('https://sellerinventory.yswg.com.cn/pm/formal/update', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-csrf-token': decodeURIComponent(token), 'x-requested-with': 'XMLHttpRequest' },
      body: body.toString(),
    });
    const json = await res.json().catch(() => null);
    console.log('[batch-append]', row.sku, { httpStatus: res.status, json, oldNote: row.oldNote, appendText, finalNote, body: body.toString() });
    return { sku: row.sku, httpStatus: res.status, json };
  }

  console.log('[batch-append] results', await Promise.all(rows.map(appendOne)));
})();
```
