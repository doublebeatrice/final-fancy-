const assert = require('assert');
const {
  classifyOcrText,
  extractChatContext,
  extractSkus,
  normalizeOcrText,
  triageOcrResult,
} = require('../src/wecom_ocr_triage');

{
  assert.strictEqual(normalizeOcrText('0A3281  开发 问'), '0A3281 开发 问');
  assert.ok(extractSkus('0A3281 0A4115 QA3278').includes('QA3281'));
  assert.ok(extractSkus('0A3281 0A4115 QA3278').includes('QA4115'));
}

{
  assert.strictEqual(classifyOcrText('开发问 HAY0218 为什么没流量 能不能推'), 'developer_product_inquiry');
  assert.strictEqual(classifyOcrText('会议纪要和学习资料'), 'meeting_or_learning_material');
  assert.strictEqual(classifyOcrText('老板说这个投诉有风险'), 'sentiment_or_exception_watch');
}

{
  const result = triageOcrResult({
    image: 'capture.png',
    language: 'zh-Hans-CN',
    lineCount: 3,
    text: '@我 开发问 0A3281 为什么没流量',
    lines: [
      { text: '唐娜', x: 30, y: 130 },
      { text: '文件传输助手', x: 30, y: 340 },
      { text: '聊天内容', x: 330, y: 200 },
    ],
  });
  assert.strictEqual(result.category, 'developer_product_inquiry');
  assert.strictEqual(result.priority, 'P0');
  assert.ok(result.detectedSubjects.skus.includes('QA3281'));
  assert.deepStrictEqual(result.conversationCandidates, ['唐娜', '文件传输助手']);
}

{
  const context = extractChatContext({
    width: 1920,
    lines: [
      { text: '这个能干个品牌故事吗', x: 1768, y: 99 },
      { text: '榆滨，NAY4977 NAY4987 挂在 NAY0239 下，文案和实物不一致', x: 1118, y: 275 },
      { text: '黄成哲(ALL IN AD:', x: 440, y: 371 },
      { text: '榆滨，NAY4977 NAY4987 挂在 NAY0239 下', x: 440, y: 391 },
      { text: '跟母体一样的，就是卡片主题的区别', x: 439, y: 434 },
      { text: '黄成哲(ALL IN AD:', x: 440, y: 486 },
      { text: '问的怎么样了～', x: 441, y: 507 },
      { text: '搞定了，现在问下', x: 439, y: 532 },
    ],
  });
  assert.ok(context.yourLastMessage.includes('NAY4977'));
  assert.strictEqual(context.latestIncoming, '搞定了，现在问下');
  assert.ok(context.quotedContext.includes('问的怎么样'));
  assert.strictEqual(context.state, 'closed_or_archivable');
}

{
  const result = triageOcrResult({
    width: 1920,
    text: 'NAY4977 NAY4987 NAY0239 品牌故事 变体 文案 实物',
    lines: [
      { text: '榆滨，NAY4977 NAY4987 挂在 NAY0239 下，文案和实物不一致', x: 1118, y: 275 },
      { text: '黄成哲(ALL IN AD:', x: 440, y: 486 },
      { text: '问的怎么样了～', x: 441, y: 507 },
      { text: '忘了，现在问下', x: 439, y: 532 },
    ],
  });
  assert.strictEqual(result.category, 'developer_product_inquiry');
  assert.strictEqual(result.priority, 'P2');
  assert.strictEqual(result.chatContext.state, 'waiting_external_confirmation');
  assert.strictEqual(result.chatContext.latestIncoming, '忘了，现在问下');
}

console.log('wecom_ocr_triage tests passed');
