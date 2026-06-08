const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  appendMessageEvent,
  buildDigest,
  cleanupWecomFiles,
  dailyMessageFile,
  normalizeVworkMessage,
  redactContent,
  shouldPushImmediate,
  writeDigest,
} = require('../src/wecom_gateway');

const config = {
  timezone: 'Asia/Shanghai',
  outDir: '',
  operatorAliases: ['黄成喆', '我'],
  groupWhitelist: ['开发重点群'],
  directSenderWhitelist: ['张三'],
  codexThreadId: 'thread_review',
};

{
  const event = normalizeVworkMessage({
    msg_id: 'm1',
    room_name: '开发重点群',
    sender_name: '李四',
    content: '@黄成喆 开发问 HAY0218 为什么没流量，能不能推？手机号 13812345678 https://example.com',
    at_list: ['黄成喆'],
    timestamp: '2026-06-04T01:00:00.000Z',
  }, config, new Date('2026-06-04T01:00:00.000Z'));

  assert.strictEqual(event.source, 'wecom');
  assert.strictEqual(event.chatType, 'group');
  assert.strictEqual(event.mentionsOperator, true);
  assert.strictEqual(event.immediate, true);
  assert.strictEqual(event.routingReason, 'whitelisted_group_mention');
  assert.strictEqual(event.category, 'developer_product_inquiry');
  assert.strictEqual(event.priority, 'P0');
  assert.deepStrictEqual(event.detectedSubjects.skus, ['HAY0218']);
  assert.ok(event.redactedSummary.includes('[PHONE]'));
  assert.ok(event.redactedSummary.includes('[URL]'));
  assert.ok(event.reviewDraft.agentTask);
  assert.ok(!JSON.stringify(event).includes('13812345678'));
  assert.ok(!JSON.stringify(event).includes('https://example.com'));
  assert.ok(event.reviewDraft.missingEvidence.includes('ad_backend_sku_summary'));
}

{
  const event = normalizeVworkMessage({
    room_name: '开发重点群',
    sender_name: '李四',
    content: '今天下午开会纪要和学习资料稍后发群里',
    timestamp: '2026-06-04T02:00:00.000Z',
  }, config);

  assert.strictEqual(event.category, 'meeting_or_learning_material');
  assert.strictEqual(event.immediate, false);
  assert.strictEqual(shouldPushImmediate(event, config), false);
  assert.ok(event.reviewDraft.suggestedAction.includes('会议'));
}

{
  const event = normalizeVworkMessage({
    sender_name: '张三',
    content: '这个投诉有账号风险，今天要看一下',
    timestamp: '2026-06-04T03:00:00.000Z',
  }, config);

  assert.strictEqual(event.chatType, 'direct');
  assert.strictEqual(event.category, 'sentiment_or_exception_watch');
  assert.strictEqual(event.immediate, true);
  assert.strictEqual(event.routingReason, 'whitelisted_direct_sender');
  assert.strictEqual(event.priority, 'P0');
}

{
  const redacted = redactContent('token=abc123 cookie:xyz 12345678901 user@example.com');
  assert.ok(redacted.includes('token=[REDACTED]'));
  assert.ok(redacted.includes('cookie=[REDACTED]'));
  assert.ok(redacted.includes('[PHONE]') || redacted.includes('[ID]'));
  assert.ok(redacted.includes('[EMAIL]'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-gateway-'));
  const event = normalizeVworkMessage({
    sender_name: '张三',
    content: '开发问 LUO1006 点击没了能加投吗',
    timestamp: '2026-06-04T04:00:00.000Z',
  }, { ...config, outDir: tmpDir });

  const first = appendMessageEvent(event, { outDir: tmpDir });
  const second = appendMessageEvent(event, { outDir: tmpDir });
  assert.strictEqual(first.inserted, true);
  assert.strictEqual(second.inserted, false);
  assert.ok(fs.existsSync(dailyMessageFile(tmpDir, '2026-06-04')));

  const digest = buildDigest({
    config: { ...config, outDir: tmpDir },
    today: '2026-06-04',
    slot: '10:00',
    outDir: tmpDir,
  });
  assert.strictEqual(digest.summary.total, 1);
  assert.strictEqual(digest.codexThreadId, 'thread_review');
  assert.ok(digest.prompt.includes('企业微信待审摘要'));
  assert.ok(digest.prompt.includes('LUO1006'));
  const files = writeDigest(digest, { outDir: tmpDir });
  assert.ok(fs.existsSync(files.jsonFile));
  assert.ok(fs.existsSync(files.mdFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-cleanup-'));
  fs.writeFileSync(path.join(tmpDir, 'wecom_messages_2026-05-20.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'wecom_digest_2026-05-20_1000.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'wecom_codex_prompt_2026-05-20_1000.md'), '', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'agent_ledger_2026-05-20.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'wecom_messages_2026-06-03.json'), '{}', 'utf8');

  const result = cleanupWecomFiles({
    outDir: tmpDir,
    today: '2026-06-04',
    retentionDays: 7,
    timezone: 'Asia/Shanghai',
  });
  assert.strictEqual(result.deleted.length, 3);
  assert.ok(fs.existsSync(path.join(tmpDir, 'agent_ledger_2026-05-20.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'wecom_messages_2026-06-03.json')));
}

console.log('wecom_gateway tests passed');
