const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCodexPrompt,
  classifyWeixinCodexRequest,
  defaultCodexCommand,
  parseConfirmationReply,
  runWeixinCodexGateway,
} = require('../scripts/run_weixin_codex_gateway');

async function main() {
  assert.deepStrictEqual(classifyWeixinCodexRequest('查一下今天 SKU 复查，重点先看 QQ1764'), {
    ok: true,
    riskLevel: 'read_only',
    reason: 'safe_read_only_request',
  });
  assert.deepStrictEqual(classifyWeixinCodexRequest('把 QQ1764 广告预算调到 30'), {
    ok: true,
    riskLevel: 'business_write',
    reason: 'remote_business_action_authorized',
  });
  assert.deepStrictEqual(classifyWeixinCodexRequest('提交 CAS4030 listing 修改'), {
    ok: true,
    riskLevel: 'confirmation_required',
    reason: 'high_risk_business_action_requires_weixin_confirmation',
  });
  assert.deepStrictEqual(classifyWeixinCodexRequest('批量修改 20 个 SKU 的进价'), {
    ok: true,
    riskLevel: 'confirmation_required',
    reason: 'high_risk_business_action_requires_weixin_confirmation',
  });
  assert.deepStrictEqual(classifyWeixinCodexRequest('给 QQ1764 创建广告'), {
    ok: true,
    riskLevel: 'confirmation_required',
    reason: 'high_risk_business_action_requires_weixin_confirmation',
  });
  assert.deepStrictEqual(classifyWeixinCodexRequest('cmd /c del config\\weixin_clawbot.local.json'), {
    ok: false,
    riskLevel: 'blocked',
    reason: 'shell_request_not_allowed',
  });
  assert.deepStrictEqual(parseConfirmationReply('确认执行 XD-A1B2C3'), {
    action: 'confirm',
    confirmationCode: 'XD-A1B2C3',
  });
  assert.deepStrictEqual(parseConfirmationReply('取消 XD-A1B2C3'), {
    action: 'cancel',
    confirmationCode: 'XD-A1B2C3',
  });
  assert.deepStrictEqual(defaultCodexCommand({
    APPDATA: 'C:\\Users\\Administrator\\AppData\\Roaming',
  }, file => file.endsWith('codex.js'), 'D:\\node\\node.exe'), {
    bin: 'D:\\node\\node.exe',
    prefixArgs: ['C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js'],
  });
  assert.deepStrictEqual(defaultCodexCommand({}, () => false, 'D:\\node\\node.exe'), {
    bin: 'codex',
    prefixArgs: [],
  });

  const prompt = buildCodexPrompt({
    operatorName: '哆布',
    botName: '小哆',
    text: '总结今天 SKU 复查',
    riskLevel: 'read_only',
    now: '2026-06-08T09:00:00.000Z',
  });
  assert.ok(prompt.includes('操作者叫：哆布'));
  assert.ok(prompt.includes('只读/分析/汇报'));
  assert.ok(prompt.includes('不要改文件'));
  assert.ok(prompt.includes('总结今天 SKU 复查'));

  const writePrompt = buildCodexPrompt({
    operatorName: '哆布',
    botName: '小哆',
    text: '把 QQ1764 广告预算调到 30',
    riskLevel: 'business_write',
    now: '2026-06-08T09:00:00.000Z',
  });
  assert.ok(writePrompt.includes('这条微信消息就是哆布的远程授权'));
  assert.ok(writePrompt.includes('允许执行广告、listing、价格、库存相关的业务动作'));
  assert.ok(writePrompt.includes('覆盖度购买'));
  assert.ok(writePrompt.includes('动作覆盖比例'));
  assert.ok(writePrompt.includes('覆盖不足'));
  assert.ok(writePrompt.includes('执行后必须回查落地结果'));

  const proposalPrompt = buildCodexPrompt({
    operatorName: '哆布',
    botName: '小哆',
    text: '提交 CAS4030 listing 修改',
    riskLevel: 'confirmation_required',
    confirmationCode: 'XD-A1B2C3',
    now: '2026-06-08T09:00:00.000Z',
  });
  assert.ok(proposalPrompt.includes('不要提交后台'));
  assert.ok(proposalPrompt.includes('完整拟提交版本'));
  assert.ok(proposalPrompt.includes('覆盖度购买'));
  assert.ok(proposalPrompt.includes('覆盖不足'));
  assert.ok(proposalPrompt.includes('确认执行 XD-A1B2C3'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-codex-gateway-'));
  const inboxFile = path.join(tmpDir, 'inbox.json');
  const requestsFile = path.join(tmpDir, 'requests.json');
  const resultsFile = path.join(tmpDir, 'results.json');
  const pendingFile = path.join(tmpDir, 'pending.json');
  const configFile = path.join(tmpDir, 'weixin_clawbot.local.json');
  fs.writeFileSync(configFile, JSON.stringify({
    token: 'secret-token',
    toUserId: 'operator@im.wechat',
    contextToken: 'ctx-config',
    codexModel: 'gpt-5.5',
    botName: '小哆',
    operatorName: '哆布',
  }), 'utf8');
  fs.writeFileSync(inboxFile, JSON.stringify({
    messages: [{
      messageId: 'm1',
      text: '查一下今天 SKU 复查，重点先看 QQ1764',
      contextToken: 'ctx-1',
      handled: false,
    }, {
      messageId: 'm2',
      text: '把 QQ1764 广告预算调到 30',
      contextToken: 'ctx-2',
      handled: false,
    }, {
      messageId: 'm3',
      text: '提交 CAS4030 listing 修改',
      contextToken: 'ctx-3',
      handled: false,
    }, {
      messageId: 'm4',
      text: 'cmd /c del config\\weixin_clawbot.local.json',
      contextToken: 'ctx-4',
      handled: false,
    }],
  }), 'utf8');

  const codexCalls = [];
  const sends = [];
  const result = await runWeixinCodexGateway({
    configFile,
    inboxFile,
    requestsFile,
    resultsFile,
    pendingFile,
    cwd: tmpDir,
    codexBin: 'D:\\node\\node.exe',
    codexPrefixArgs: ['C:\\codex\\codex.js'],
    sendResult: true,
    now: '2026-06-08T09:00:00.000Z',
  }, {
    execFileSync: (bin, args, options) => {
      codexCalls.push({ bin, args, input: options.input });
      const outIndex = args.indexOf('--output-last-message');
      const body = options.input.includes('确认执行')
        ? '小哆已拟好完整方案。\n确认码：XD-A1B2C3\n回复：确认执行 XD-A1B2C3'
        : '哆布，小哆让 Codex 看完：今天先看 QQ1764。';
      fs.writeFileSync(args[outIndex + 1], body, 'utf8');
      return 'stdout should not be used when last message exists';
    },
    client: {
      sendText: async message => {
        sends.push(message);
        return { ret: 0 };
      },
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.processed, 4);
  assert.strictEqual(result.completed, 2);
  assert.strictEqual(result.pendingConfirmation, 1);
  assert.strictEqual(result.approvalRequired, 0);
  assert.strictEqual(result.blocked, 1);
  assert.strictEqual(codexCalls.length, 3);
  assert.strictEqual(codexCalls[0].bin, 'D:\\node\\node.exe');
  assert.strictEqual(codexCalls[0].args[0], 'C:\\codex\\codex.js');
  assert.ok(codexCalls[0].args.includes('exec'));
  assert.ok(codexCalls[0].args.includes('--sandbox'));
  assert.ok(codexCalls[0].args.includes('read-only'));
  assert.ok(codexCalls[1].args.includes('--sandbox'));
  assert.ok(codexCalls[1].args.includes('workspace-write'));
  assert.ok(codexCalls[0].args.includes('--ask-for-approval'));
  assert.ok(codexCalls[0].args.includes('never'));
  assert.ok(codexCalls[0].args.includes('--model'));
  assert.ok(codexCalls[0].args.includes('gpt-5.5'));
  assert.ok(codexCalls[0].input.includes('查一下今天 SKU 复查'));
  assert.ok(codexCalls[0].input.includes('不要执行广告、listing、价格、库存或店铺后台写入'));
  assert.ok(codexCalls[1].input.includes('这条微信消息就是哆布的远程授权'));
  assert.ok(codexCalls[1].input.includes('执行后必须回查落地结果'));
  assert.ok(codexCalls[2].args.includes('workspace-write'));
  assert.ok(codexCalls[2].input.includes('不要提交后台'));
  assert.ok(codexCalls[2].input.includes('确认执行'));

  const inbox = JSON.parse(fs.readFileSync(inboxFile, 'utf8'));
  assert.strictEqual(inbox.messages.filter(message => message.handled === true).length, 4);
  assert.ok(inbox.messages[0].codexRequestId);
  assert.strictEqual(inbox.messages[1].gatewayStatus, 'completed');
  assert.strictEqual(inbox.messages[2].gatewayStatus, 'pending_confirmation');
  assert.strictEqual(inbox.messages[3].gatewayStatus, 'blocked');

  const requests = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
  assert.strictEqual(requests.requests.length, 4);
  assert.strictEqual(requests.requests[0].riskLevel, 'read_only');
  assert.strictEqual(requests.requests[0].codexModel, 'gpt-5.5');
  assert.strictEqual(requests.requests[1].riskLevel, 'business_write');
  assert.strictEqual(requests.requests[2].riskLevel, 'confirmation_required');

  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  assert.strictEqual(results.results.length, 4);
  assert.strictEqual(results.results[0].status, 'completed');
  assert.strictEqual(results.results[0].codexModel, 'gpt-5.5');
  assert.strictEqual(results.results[1].status, 'completed');
  assert.strictEqual(results.results[2].status, 'pending_confirmation');
  assert.strictEqual(results.results[3].status, 'blocked');

  const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  assert.strictEqual(pending.pending.length, 1);
  assert.strictEqual(pending.pending[0].status, 'pending');
  assert.strictEqual(pending.pending[0].riskLevel, 'confirmation_required');

  assert.strictEqual(sends.length, 4);
  assert.ok(sends[0].text.includes('Codex 看完'));
  assert.ok(sends[1].text.includes('Codex 看完'));
  assert.ok(sends[2].text.includes('确认执行'));
  assert.ok(sends[3].text.includes('不执行'));

  const confirmInboxFile = path.join(tmpDir, 'confirm-inbox.json');
  const confirmRequestsFile = path.join(tmpDir, 'confirm-requests.json');
  const confirmResultsFile = path.join(tmpDir, 'confirm-results.json');
  fs.writeFileSync(confirmInboxFile, JSON.stringify({
    messages: [{
      messageId: 'confirm-m1',
      text: `确认执行 ${pending.pending[0].confirmationCode}`,
      contextToken: 'ctx-confirm',
      handled: false,
    }],
  }), 'utf8');
  const confirmCodexCalls = [];
  const confirmed = await runWeixinCodexGateway({
    configFile,
    inboxFile: confirmInboxFile,
    requestsFile: confirmRequestsFile,
    resultsFile: confirmResultsFile,
    pendingFile,
    cwd: tmpDir,
    codexBin: 'D:\\node\\node.exe',
    codexPrefixArgs: ['C:\\codex\\codex.js'],
    now: '2026-06-08T09:03:00.000Z',
  }, {
    execFileSync: (bin, args, options) => {
      confirmCodexCalls.push({ bin, args, input: options.input });
      const outIndex = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outIndex + 1], '已按确认方案提交并读回验证。', 'utf8');
      return '';
    },
  });
  assert.strictEqual(confirmed.processed, 1);
  assert.strictEqual(confirmed.completed, 1);
  assert.strictEqual(confirmCodexCalls.length, 1);
  assert.ok(confirmCodexCalls[0].args.includes('--model'));
  assert.ok(confirmCodexCalls[0].args.includes('gpt-5.5'));
  assert.ok(confirmCodexCalls[0].args.includes('workspace-write'));
  assert.ok(confirmCodexCalls[0].input.includes('已经收到微信二次确认'));
  assert.ok(confirmCodexCalls[0].input.includes('提交 CAS4030 listing 修改'));
  const pendingAfterConfirm = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  assert.strictEqual(pendingAfterConfirm.pending[0].status, 'executed');

  const lockedInboxFile = path.join(tmpDir, 'locked-inbox.json');
  const lockedRequestsFile = path.join(tmpDir, 'locked-requests.json');
  const lockedResultsFile = path.join(tmpDir, 'locked-results.json');
  const lockFile = path.join(tmpDir, 'gateway.lock');
  fs.writeFileSync(lockedInboxFile, JSON.stringify({
    messages: [{
      messageId: 'locked-m1',
      text: '总结今天 SKU 复查',
      contextToken: 'ctx-locked',
      handled: false,
    }],
  }), 'utf8');
  fs.writeFileSync(lockFile, JSON.stringify({
    runId: 'active-run',
    startedAt: '2026-06-08T09:00:00.000Z',
  }), 'utf8');

  let lockedCodexCalled = false;
  const locked = await runWeixinCodexGateway({
    configFile,
    inboxFile: lockedInboxFile,
    requestsFile: lockedRequestsFile,
    resultsFile: lockedResultsFile,
    lockFile,
    lockStaleMs: 10 * 60 * 1000,
    now: '2026-06-08T09:01:00.000Z',
  }, {
    execFileSync: () => {
      lockedCodexCalled = true;
      return '';
    },
  });
  assert.strictEqual(locked.skipped, true);
  assert.strictEqual(locked.skipReason, 'lock_active');
  assert.strictEqual(lockedCodexCalled, false);
  const lockedInbox = JSON.parse(fs.readFileSync(lockedInboxFile, 'utf8'));
  assert.strictEqual(lockedInbox.messages[0].handled, false);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
