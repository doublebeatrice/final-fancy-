const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createWeixinClawbotClient } = require('../src/weixin_clawbot_http');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG_FILE = path.join(ROOT, 'config', 'weixin_clawbot.local.json');
const DEFAULT_INBOX_FILE = path.join(ROOT, 'data', 'agent', 'weixin_clawbot_replies_inbox.json');
const DEFAULT_REQUESTS_FILE = path.join(ROOT, 'data', 'agent', 'weixin_codex_requests.json');
const DEFAULT_RESULTS_FILE = path.join(ROOT, 'data', 'agent', 'weixin_codex_results.json');
const DEFAULT_LAST_MESSAGE_DIR = path.join(ROOT, 'data', 'agent', 'weixin_codex_last_messages');
const DEFAULT_LOCK_FILE = path.join(ROOT, 'data', 'agent', 'weixin_codex_gateway.lock.json');
const DEFAULT_PENDING_FILE = path.join(ROOT, 'data', 'agent', 'weixin_codex_pending_confirmations.json');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_LOCK_STALE_MS = 30 * 60 * 1000;
const COVERAGE_SUFFICIENCY_RULE = '- 如果消息涉及覆盖面、覆盖度购买、购买覆盖、力度够不够、同比下滑、恢复下滑或增长 push，必须先回答够/不够/证据不足，再写目标订单缺口、点击缺口、动作覆盖比例和缺失层；覆盖不了主缺口时直接写“覆盖不足”，不能用已执行动作或读回结果代替覆盖足够。';

function text(value) {
  return String(value ?? '').trim();
}

function readJson(file, fallback = {}) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function readText(file, fallback = '') {
  if (!file || !fs.existsSync(file)) return fallback;
  return fs.readFileSync(file, 'utf8');
}

function removeFile(file) {
  if (!file || !fs.existsSync(file)) return;
  fs.unlinkSync(file);
}

function hashId(value) {
  return crypto.createHash('sha1').update(text(value)).digest('hex').slice(0, 12);
}

function defaultCodexCommand(env = process.env, existsSync = fs.existsSync, nodeExe = process.execPath) {
  const appData = text(env.APPDATA);
  const codexJs = appData ? path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : '';
  if (codexJs && existsSync(codexJs)) {
    return {
      bin: nodeExe,
      prefixArgs: [codexJs],
    };
  }
  return {
    bin: 'codex',
    prefixArgs: [],
  };
}

function requestIdFor(message = {}) {
  const base = text(message.messageId) || `${text(message.createTimeMs)}:${text(message.text)}`;
  return `weixin_codex_${hashId(base)}`;
}

function confirmationCodeFor(requestId, value) {
  return `XD-${crypto.createHash('sha1').update(`${text(requestId)}:${text(value)}`).digest('hex').slice(0, 6).toUpperCase()}`;
}

function normalizeConfirmationCode(value) {
  return text(value).toUpperCase();
}

function parseConfirmationReply(value) {
  const raw = text(value);
  const match = raw.match(/\b(XD-[A-Za-z0-9]{4,12})\b/i);
  if (!match) return { action: 'none' };
  const confirmationCode = normalizeConfirmationCode(match[1]);
  if (/\u786e\u8ba4\u6267\u884c|\u786e\u8ba4|confirm/i.test(raw)) {
    return { action: 'confirm', confirmationCode };
  }
  if (/\u53d6\u6d88|\u4e0d\u6267\u884c|\u4f5c\u5e9f|cancel/i.test(raw)) {
    return { action: 'cancel', confirmationCode };
  }
  return { action: 'none' };
}

function readPendingConfirmations(file) {
  const existing = readJson(file, { pending: [] });
  return {
    ...existing,
    pending: Array.isArray(existing.pending) ? existing.pending : [],
  };
}

function writePendingConfirmations(file, value) {
  writeJson(file, {
    ...value,
    pending: Array.isArray(value.pending) ? value.pending : [],
  });
}

function findPendingConfirmation(pendingState = {}, confirmationCode = '') {
  const code = normalizeConfirmationCode(confirmationCode);
  return (pendingState.pending || []).find(item =>
    item &&
    item.status === 'pending' &&
    normalizeConfirmationCode(item.confirmationCode) === code
  );
}

function buildConfirmationInstruction(confirmationCode) {
  const code = normalizeConfirmationCode(confirmationCode);
  return [
    `\u56de\u590d\uff1a\u786e\u8ba4\u6267\u884c ${code}`,
    `\u53d6\u6d88\uff1a\u53d6\u6d88 ${code}`,
  ].join('\n');
}

function withConfirmationInstruction(summary, confirmationCode) {
  const body = text(summary);
  const code = normalizeConfirmationCode(confirmationCode);
  const instruction = buildConfirmationInstruction(code);
  if (body.includes(code)) return body;
  return [body, instruction].filter(Boolean).join('\n\n');
}

function appendJsonList(file, key, items = []) {
  const existing = readJson(file, { [key]: [] });
  const seen = new Set((existing[key] || []).map(item => text(item.requestId)).filter(Boolean));
  const nextItems = items.filter(item => !seen.has(text(item.requestId)));
  writeJson(file, {
    ...existing,
    [key]: [...(existing[key] || []), ...nextItems],
  });
}

function parseTimeMs(value) {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function acquireGatewayLock(options = {}) {
  const lockFile = options.lockFile || DEFAULT_LOCK_FILE;
  const now = text(options.now || new Date().toISOString());
  const staleMs = Math.max(1000, Number(options.lockStaleMs || DEFAULT_LOCK_STALE_MS));
  const existing = readJson(lockFile, null);
  if (existing) {
    const ageMs = parseTimeMs(now) - parseTimeMs(existing.startedAt);
    if (ageMs >= 0 && ageMs < staleMs) {
      return {
        acquired: false,
        lockFile,
        reason: 'lock_active',
        existing,
      };
    }
  }
  const lock = {
    runId: `weixin_codex_gateway_${Date.now()}`,
    startedAt: now,
  };
  writeJson(lockFile, lock);
  return {
    acquired: true,
    lockFile,
    lock,
  };
}

function classifyWeixinCodexRequest(value) {
  const raw = text(value);
  const lower = raw.toLowerCase();
  if (!raw) return { ok: false, riskLevel: 'blocked', reason: 'empty_request' };
  if (/(^|\s)(cmd|powershell|pwsh|bash|sh|npm|node|python|git|schtasks|reg|curl|wget)(\s|$|\/)/i.test(raw) ||
    /[;&|`]/.test(raw) ||
    /\b(del|rm|rmdir|erase|move|copy)\b/i.test(raw) ||
    /remove-item|invoke-webrequest|start-process/i.test(lower)) {
    return { ok: false, riskLevel: 'blocked', reason: 'shell_request_not_allowed' };
  }
  if (/token|cookie|secret|password|passwd|密码|密钥|凭证|config\\|\.env/i.test(raw)) {
    return { ok: false, riskLevel: 'blocked', reason: 'secret_request_not_allowed' };
  }
  const listingWrite = /listing|标题|五点|bullet|search terms?|搜索词|文案/i.test(raw) &&
    /提交|修改|改|更新|上架|刊登|submit|update/i.test(raw);
  const batchCostWrite = /批量|多个|\d+\s*个/i.test(raw) &&
    /进价|成本|采购价|purchase cost|cost|调价|改价|提价|降价/i.test(raw);
  const adCreate = /创建广告|建广告|新建广告|搭建广告|广告创立|create ads?|create campaign/i.test(raw);
  if (listingWrite || batchCostWrite || adCreate) {
    return {
      ok: true,
      riskLevel: 'confirmation_required',
      reason: 'high_risk_business_action_requires_weixin_confirmation',
    };
  }
  if (/调价|改价|提价|降价|改预算|预算调|出价|竞价|调 bid|bid up|bid down|暂停|停掉|开启|启用|否定|加否|上架|下架|库存|补货|移除|清仓|执行落地|直接执行/i.test(raw)) {
    return { ok: true, riskLevel: 'business_write', reason: 'remote_business_action_authorized' };
  }
  return { ok: true, riskLevel: 'read_only', reason: 'safe_read_only_request' };
}

function buildCodexPrompt(options = {}) {
  const botName = text(options.botName || '小哆');
  const operatorName = text(options.operatorName || '哆布');
  const now = text(options.now || new Date().toISOString());
  const userText = text(options.text);
  const riskLevel = text(options.riskLevel || 'read_only');
  const confirmationCode = normalizeConfirmationCode(options.confirmationCode);
  if (riskLevel === 'confirmation_required') {
    return [
      `你是从微信 ClawBot「${botName}」触发的 Codex 子任务。`,
      `操作者叫：${operatorName}。`,
      `当前时间：${now}。`,
      '',
      '微信二次确认边界：',
      '- 这是一条高风险业务动作请求，当前只允许读取证据、拟定完整方案，不要提交后台，不要执行落地写入。',
      '- 如果是 listing，请输出完整拟提交版本：标题、五点、描述、搜索词，以及字段变化范围。',
      '- 如果是批量价格/进价/成本修改，请输出完整批量清单：SKU、原值、新值、原因、风险和回查方式。',
      '- 如果是创建广告或广告调整，必须先按 D:\\ad-ops-brain\\playbooks\\广告调整完整结构.md 输出完整结构：经营目标、调整范围、问题规模、现有投放层、待新增/补建投放层、覆盖缺口、动作力度和 3/7 天验收；再给广告创建计划：SKU/ASIN、campaign、ad group、预算、出价、投放词/ASIN、匹配方式和复查点。',
      COVERAGE_SUFFICIENCY_RULE,
      '- 方案必须足够完整，让哆布在微信里看完后可以直接决定是否执行。',
      '- 不要要求哆布回电脑确认；确认只能通过微信回复完成。',
      `- 结尾必须写清楚：确认无误后回复「确认执行 ${confirmationCode}」。`,
      `- 也写清楚：不执行就回复「取消 ${confirmationCode}」。`,
      '',
      '微信消息：',
      userText,
      '',
      buildConfirmationInstruction(confirmationCode),
    ].join('\n');
  }
  if (riskLevel === 'confirmed_execution') {
    return [
      `你是从微信 ClawBot「${botName}」触发的 Codex 子任务。`,
      `操作者叫：${operatorName}。`,
      `当前时间：${now}。`,
      '',
      `已经收到微信二次确认：确认执行 ${confirmationCode}。`,
      '- 现在允许执行此前拟定并已确认的业务方案。',
      '- 只能执行原始微信请求和已确认方案里的动作，不要扩展到其他 SKU、其他活动或额外策略。',
      '- 执行前先读取 GBrain 和当前本地/ live 证据，说明证据边界。',
      '- 广告动作必须以 D:\\ad-ops-brain\\playbooks\\广告调整完整结构.md 为主标准；如果确认方案没有写清调整范围、问题规模、现有投放层、待新增/补建投放层和覆盖缺口，先停止并说明方案不足。',
      COVERAGE_SUFFICIENCY_RULE,
      '- 执行后必须回查落地结果；listing 要区分已提交待审核和前台已生效；广告要回查 changed row、enabled state、bid/budget 和父级状态；价格/进价要读回修改后结果。',
      '- 如果登录、token、后台不可达、实体不明确或确认方案无法安全执行，就停止并说明卡点，不要编造执行成功。',
      '- 仍然禁止 shell 破坏性操作、密钥读取、任意文件删除、git 提交或无关文件改动。',
      '- 回复要适合微信阅读：先说是否已落地，再给证据和下一步。',
      '',
      '原始微信请求：',
      text(options.originalText || userText),
      '',
      '此前完整拟提交版本/执行计划：',
      text(options.proposalSummary || '未记录到方案正文；请先停止并说明缺少可执行确认方案。'),
      '',
      '本次微信确认消息：',
      userText,
    ].join('\n');
  }
  if (riskLevel === 'business_write') {
    return [
      `你是从微信 ClawBot「${botName}」触发的 Codex 子任务。`,
      `操作者叫：${operatorName}。`,
      `当前时间：${now}。`,
      '',
      '远程授权：',
      `- 这条微信消息就是${operatorName}的远程授权，不要要求回电脑再次确认。`,
      '- 允许执行广告、listing、价格、库存相关的业务动作。',
      '- 只能执行微信消息中明确要求的业务动作，不要扩展到其他 SKU、其他活动或额外策略。',
      '- 执行前先读取 GBrain 和当前本地/ live 证据，说明证据边界。',
      '- 广告动作必须以 D:\\ad-ops-brain\\playbooks\\广告调整完整结构.md 为主标准，先写清经营目标、调整范围、问题规模、现有投放层、待新增/补建投放层、覆盖缺口、力度、读回和 3/7 天验收；覆盖不了主要缺口时直接写“覆盖不足”。',
      COVERAGE_SUFFICIENCY_RULE,
      '- 执行后必须回查落地结果；广告动作要回查 changed row、enabled state、bid/budget 和父级状态；其他后台动作也要读回确认。',
      '- 如果登录、token、后台不可达、实体不明确或风险超出微信指令，就停止并说明卡点，不要编造执行成功。',
      '- 仍然禁止 shell 破坏性操作、密钥读取、任意文件删除、git 提交或无关文件改动。',
      '- 回复要适合微信阅读：先说是否已落地，再给证据和下一步。',
      '',
      '微信消息：',
      userText,
    ].join('\n');
  }
  return [
    `你是从微信 ClawBot「${botName}」触发的 Codex 子任务。`,
    `操作者叫：${operatorName}。`,
    `当前时间：${now}。`,
    '',
    '任务边界：',
    '- 只读/分析/汇报。可以读取本地项目、GBrain 和本地快照来回答。',
    '- 不要改文件，不要写入系统，不要提交 git。',
    '- 不要执行广告、listing、价格、库存或店铺后台写入。',
    '- 如果用户要求写入或后台动作，只说明需要在 Codex 主会话人工确认，并给出建议步骤。',
    COVERAGE_SUFFICIENCY_RULE,
    '- 回复要适合微信阅读：短、分段、先给结论，再给下一步。',
    '',
    '微信消息：',
    userText,
  ].join('\n');
}

function summarizeFailure(error, stdout = '') {
  const stderr = error?.stderr ? String(error.stderr) : '';
  return text(stderr || stdout || error?.message || 'Codex execution failed').replace(/\s+/g, ' ').slice(0, 800);
}

function buildCodexArgs(options = {}) {
  const args = [
    '--ask-for-approval', 'never',
    'exec',
    '--cd', options.cwd || ROOT,
    '--sandbox', options.sandbox || 'read-only',
    '--output-last-message', options.lastMessageFile,
  ];
  if (text(options.model)) args.push('--model', text(options.model));
  args.push('-');
  return args;
}

function runCodexRequest(request = {}, options = {}, injected = {}) {
  const execFileSync = injected.execFileSync || childProcess.execFileSync;
  const defaultCommand = defaultCodexCommand();
  const codexBin = options.codexBin || defaultCommand.bin;
  const codexPrefixArgs = options.codexPrefixArgs || defaultCommand.prefixArgs;
  const lastMessageDir = options.lastMessageDir || DEFAULT_LAST_MESSAGE_DIR;
  const lastMessageFile = options.lastMessageFile || path.join(lastMessageDir, `${request.requestId}.txt`);
  fs.mkdirSync(path.dirname(lastMessageFile), { recursive: true });
  const sandbox = ['business_write', 'confirmation_required', 'confirmed_execution'].includes(request.riskLevel)
    ? 'workspace-write'
    : (options.sandbox || 'read-only');
  const args = [...codexPrefixArgs, ...buildCodexArgs({
    cwd: options.cwd || ROOT,
    sandbox,
    lastMessageFile,
    model: options.model,
  })];
  const codexModel = text(options.model);
  try {
    const stdout = execFileSync(codexBin, args, {
      cwd: options.cwd || ROOT,
      encoding: 'utf8',
      input: request.prompt,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)),
    });
    const lastMessage = text(readText(lastMessageFile)) || text(stdout);
    return {
      requestId: request.requestId,
      messageId: request.messageId,
      status: 'completed',
      riskLevel: request.riskLevel,
      ...(codexModel ? { codexModel } : {}),
      summary: lastMessage || 'Codex 已处理，但没有返回正文。',
      lastMessageFile,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      messageId: request.messageId,
      status: 'failed',
      riskLevel: request.riskLevel,
      ...(codexModel ? { codexModel } : {}),
      summary: summarizeFailure(error),
      error: text(error.message),
      lastMessageFile,
      finishedAt: new Date().toISOString(),
    };
  }
}

function resultReplyText(result = {}, options = {}) {
  const botName = text(options.botName || '小哆');
  const operatorName = text(options.operatorName || '哆布');
  if (result.status === 'completed') return text(result.summary).slice(0, 1800);
  if (result.status === 'pending_confirmation') return text(result.summary).slice(0, 1800);
  if (result.status === 'cancelled') return `${operatorName}，${botName}已取消这次待确认操作。`;
  if (result.status === 'blocked') {
    return `${operatorName}，${botName}不执行这条微信指令。\n\n原因：${text(result.reason || '不允许从微信触发 shell、密钥或高风险操作')}。`;
  }
  return `${operatorName}，${botName}交给 Codex 时没跑成。\n\n${text(result.summary || '请在 Codex 主会话里重试。')}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const explicitCodexBin = get('--codex') || process.env.WEIXIN_CODEX_BIN || '';
  const defaultCommand = defaultCodexCommand();
  return {
    configFile: get('--config') || process.env.WEIXIN_CLAWBOT_CONFIG || DEFAULT_CONFIG_FILE,
    inboxFile: get('--inbox') || process.env.WEIXIN_CLAWBOT_INBOX || DEFAULT_INBOX_FILE,
    requestsFile: get('--requests') || process.env.WEIXIN_CODEX_REQUESTS || DEFAULT_REQUESTS_FILE,
    resultsFile: get('--results') || process.env.WEIXIN_CODEX_RESULTS || DEFAULT_RESULTS_FILE,
    pendingFile: get('--pending') || process.env.WEIXIN_CODEX_PENDING || DEFAULT_PENDING_FILE,
    cwd: get('--cwd') || process.env.WEIXIN_CODEX_CWD || ROOT,
    codexBin: explicitCodexBin || defaultCommand.bin,
    codexPrefixArgs: explicitCodexBin ? [] : defaultCommand.prefixArgs,
    model: get('--model') || process.env.WEIXIN_CODEX_MODEL || '',
    sandbox: get('--sandbox') || process.env.WEIXIN_CODEX_SANDBOX || 'read-only',
    timeoutMs: Number(get('--timeout-ms') || process.env.WEIXIN_CODEX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    lastMessageDir: get('--last-message-dir') || process.env.WEIXIN_CODEX_LAST_MESSAGE_DIR || DEFAULT_LAST_MESSAGE_DIR,
    lockFile: get('--lock') || process.env.WEIXIN_CODEX_LOCK || DEFAULT_LOCK_FILE,
    lockStaleMs: Number(get('--lock-stale-ms') || process.env.WEIXIN_CODEX_LOCK_STALE_MS || DEFAULT_LOCK_STALE_MS),
    sendResult: args.includes('--send-result') || process.env.WEIXIN_CODEX_SEND_RESULT === '1',
    now: get('--now') || process.env.WEIXIN_CODEX_NOW || '',
  };
}

async function sendResultIfNeeded(result = {}, message = {}, config = {}, options = {}, injected = {}) {
  if (!options.sendResult) return false;
  if (!text(config.token) || !text(config.toUserId)) return false;
  const client = injected.client || createWeixinClawbotClient({
    token: config.token,
    baseUrl: config.baseUrl,
  });
  await client.sendText({
    toUserId: config.toUserId,
    contextToken: text(message.contextToken) || text(config.contextToken),
    text: resultReplyText(result, {
      botName: config.botName || '小哆',
      operatorName: config.operatorName || '哆布',
    }),
  });
  return true;
}

async function runWeixinCodexGateway(options = {}, injected = {}) {
  const lock = acquireGatewayLock(options);
  if (!lock.acquired) {
    return {
      ok: true,
      skipped: true,
      skipReason: lock.reason,
      lockFile: lock.lockFile,
      processed: 0,
      completed: 0,
      failed: 0,
      approvalRequired: 0,
      pendingConfirmation: 0,
      blocked: 0,
      cancelled: 0,
      resultSent: 0,
    };
  }
  const config = readJson(options.configFile || DEFAULT_CONFIG_FILE, {});
  options = {
    ...options,
    model: text(options.model) || text(config.codexModel),
  };
  const inboxFile = options.inboxFile || DEFAULT_INBOX_FILE;
  const requestsFile = options.requestsFile || DEFAULT_REQUESTS_FILE;
  const resultsFile = options.resultsFile || DEFAULT_RESULTS_FILE;
  const pendingFile = options.pendingFile || DEFAULT_PENDING_FILE;
  try {
    const inbox = readJson(inboxFile, { messages: [] });
    const messages = (inbox.messages || []).filter(message => message && message.handled !== true && text(message.text));
    const pendingState = readPendingConfirmations(pendingFile);
    const requests = [];
    const results = [];
    let resultSent = 0;

    for (const message of messages) {
      const requestId = requestIdFor(message);
      const confirmation = parseConfirmationReply(message.text);
      const pendingConfirmation = confirmation.action === 'none'
        ? null
        : findPendingConfirmation(pendingState, confirmation.confirmationCode);
      const classification = pendingConfirmation
        ? { ok: true, riskLevel: confirmation.action === 'confirm' ? 'confirmed_execution' : 'cancelled', reason: `weixin_confirmation_${confirmation.action}` }
        : classifyWeixinCodexRequest(message.text);
      const request = {
        requestId,
        messageId: text(message.messageId),
        text: text(message.text),
        riskLevel: classification.riskLevel,
        classificationReason: classification.reason,
        ...(text(options.model) ? { codexModel: text(options.model) } : {}),
        createdAt: new Date().toISOString(),
      };

      if (pendingConfirmation && confirmation.action === 'cancel') {
        pendingConfirmation.status = 'cancelled';
        pendingConfirmation.cancelledAt = new Date().toISOString();
        pendingConfirmation.cancelMessageId = text(message.messageId);
        pendingConfirmation.cancelRequestId = requestId;
        const result = {
          requestId,
          messageId: text(message.messageId),
          status: 'cancelled',
          riskLevel: 'cancelled',
          confirmationCode: pendingConfirmation.confirmationCode,
          summary: '已取消这次待确认操作。',
          finishedAt: new Date().toISOString(),
        };
        requests.push(request);
        results.push(result);
        if (await sendResultIfNeeded(result, message, config, options, injected)) resultSent += 1;
        message.gatewayStatus = 'cancelled';
      } else if (pendingConfirmation && confirmation.action === 'confirm') {
        request.originalRequestId = pendingConfirmation.requestId;
        request.originalText = pendingConfirmation.text;
        request.confirmationCode = pendingConfirmation.confirmationCode;
        request.prompt = buildCodexPrompt({
          text: message.text,
          botName: config.botName || '小哆',
          operatorName: config.operatorName || '哆布',
          riskLevel: 'confirmed_execution',
          originalText: pendingConfirmation.text,
          proposalSummary: pendingConfirmation.proposalSummary,
          confirmationCode: pendingConfirmation.confirmationCode,
          now: options.now || new Date().toISOString(),
        });
        const result = runCodexRequest(request, options, injected);
        pendingConfirmation.status = result.status === 'completed' ? 'executed' : 'execution_failed';
        pendingConfirmation.confirmedAt = new Date().toISOString();
        pendingConfirmation.confirmMessageId = text(message.messageId);
        pendingConfirmation.executionRequestId = requestId;
        pendingConfirmation.executionResultStatus = result.status;
        requests.push(request);
        results.push(result);
        if (await sendResultIfNeeded(result, message, config, options, injected)) resultSent += 1;
        message.gatewayStatus = result.status;
      } else if (confirmation.action !== 'none') {
        const result = {
          requestId,
          messageId: text(message.messageId),
          status: 'blocked',
          riskLevel: 'blocked',
          reason: 'confirmation_code_not_found',
          summary: `没有找到待确认操作：${confirmation.confirmationCode}`,
          finishedAt: new Date().toISOString(),
        };
        requests.push(request);
        results.push(result);
        if (await sendResultIfNeeded(result, message, config, options, injected)) resultSent += 1;
        message.gatewayStatus = 'blocked';
      } else if (classification.ok) {
        const confirmationCode = classification.riskLevel === 'confirmation_required'
          ? confirmationCodeFor(requestId, message.text)
          : '';
        request.confirmationCode = confirmationCode || undefined;
        request.prompt = buildCodexPrompt({
          text: message.text,
          botName: config.botName || '小哆',
          operatorName: config.operatorName || '哆布',
          riskLevel: classification.riskLevel,
          confirmationCode,
          now: options.now || new Date().toISOString(),
        });
        const rawResult = runCodexRequest(request, options, injected);
        const result = classification.riskLevel === 'confirmation_required' && rawResult.status === 'completed'
          ? {
              ...rawResult,
              status: 'pending_confirmation',
              confirmationCode,
              summary: withConfirmationInstruction(rawResult.summary, confirmationCode),
            }
          : rawResult;
        if (classification.riskLevel === 'confirmation_required' && result.status === 'pending_confirmation') {
          pendingState.pending.push({
            requestId,
            messageId: text(message.messageId),
            text: text(message.text),
            riskLevel: classification.riskLevel,
            confirmationCode,
            proposalSummary: result.summary,
            status: 'pending',
            createdAt: request.createdAt,
            updatedAt: new Date().toISOString(),
          });
        }
        requests.push(request);
        results.push(result);
        if (await sendResultIfNeeded(result, message, config, options, injected)) resultSent += 1;
        message.gatewayStatus = result.status;
      } else {
        const result = {
          requestId,
          messageId: text(message.messageId),
          status: 'blocked',
          riskLevel: classification.riskLevel,
          reason: classification.reason,
          summary: classification.reason,
          finishedAt: new Date().toISOString(),
        };
        requests.push(request);
        results.push(result);
        if (await sendResultIfNeeded(result, message, config, options, injected)) resultSent += 1;
        message.gatewayStatus = 'blocked';
      }
      message.handled = true;
      message.handledAt = new Date().toISOString();
      message.codexRequestId = requestId;
    }

    writeJson(inboxFile, { ...inbox, messages: inbox.messages || [] });
    writePendingConfirmations(pendingFile, pendingState);
    if (requests.length) appendJsonList(requestsFile, 'requests', requests);
    else if (!fs.existsSync(requestsFile)) writeJson(requestsFile, { requests: [] });
    if (results.length) appendJsonList(resultsFile, 'results', results);
    else if (!fs.existsSync(resultsFile)) writeJson(resultsFile, { results: [] });

    return {
      ok: true,
      processed: messages.length,
      completed: results.filter(result => result.status === 'completed').length,
      failed: results.filter(result => result.status === 'failed').length,
      approvalRequired: results.filter(result => result.status === 'approval_required').length,
      pendingConfirmation: results.filter(result => result.status === 'pending_confirmation').length,
      blocked: results.filter(result => result.status === 'blocked').length,
      cancelled: results.filter(result => result.status === 'cancelled').length,
      resultSent,
      inboxFile,
      requestsFile,
      resultsFile,
      pendingFile,
    };
  } finally {
    removeFile(lock.lockFile);
  }
}

async function main() {
  const result = await runWeixinCodexGateway(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildCodexArgs,
  buildCodexPrompt,
  acquireGatewayLock,
  classifyWeixinCodexRequest,
  defaultCodexCommand,
  parseConfirmationReply,
  parseArgs,
  resultReplyText,
  runCodexRequest,
  runWeixinCodexGateway,
};
