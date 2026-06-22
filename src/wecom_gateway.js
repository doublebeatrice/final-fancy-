const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { parseExternalRequest } = require('./agent_external_inbox');

const DEFAULT_CONFIG = {
  provider: 'vworkApi',
  callbackHost: '127.0.0.1',
  callbackPort: 9000,
  apiHost: '127.0.0.1',
  apiPort: 8989,
  apiPath: '/api',
  dllHost: '127.0.0.1',
  dllPort: 8989,
  supportedWecomVersion: '5.0.3.6005',
  timezone: 'Asia/Shanghai',
  digestTimes: ['10:00', '14:00', '17:00'],
  retentionDays: 7,
  outDir: path.join('data', 'agent'),
  codexThreadId: '',
  operatorAliases: [],
  groupWhitelist: [],
  directSenderWhitelist: [],
};

const CATEGORY_LABELS = {
  developer_product_inquiry: '开发诉求',
  meeting_or_learning_material: '会议/学习资料',
  sentiment_or_exception_watch: '舆情/异常提醒',
  general_notification: '普通通知',
};

const PROVIDER_DEFAULTS = {
  vworkApi: { supportedWecomVersion: '5.0.3.6005' },
  'wechat-work-hook': { supportedWecomVersion: '4.1.36.6012' },
  mock: { supportedWecomVersion: 'n/a' },
};

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function stableHash(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.map(part => text(part)).join('|'))
    .digest('hex');
}

function dateOnly(value = new Date(), timezone = 'Asia/Shanghai') {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadConfig(file = '') {
  const configured = readJson(file, {}) || {};
  const provider = text(configured.provider || DEFAULT_CONFIG.provider);
  const providerDefaults = PROVIDER_DEFAULTS[provider] || {};
  const apiHost = text(configured.apiHost || configured.dllHost || DEFAULT_CONFIG.apiHost);
  const apiPort = Number(configured.apiPort || configured.dllPort || DEFAULT_CONFIG.apiPort);
  return {
    ...DEFAULT_CONFIG,
    ...providerDefaults,
    ...configured,
    apiHost,
    apiPort,
    apiPath: text(configured.apiPath || DEFAULT_CONFIG.apiPath),
    dllHost: text(configured.dllHost || apiHost),
    dllPort: Number(configured.dllPort || apiPort),
    provider,
    operatorAliases: list(configured.operatorAliases),
    groupWhitelist: list(configured.groupWhitelist),
    directSenderWhitelist: list(configured.directSenderWhitelist),
    digestTimes: list(configured.digestTimes).length ? list(configured.digestTimes) : DEFAULT_CONFIG.digestTimes,
  };
}

function pick(raw = {}, keys = []) {
  for (const key of keys) {
    const parts = key.split('.');
    let value = raw;
    for (const part of parts) value = value && typeof value === 'object' ? value[part] : undefined;
    if (value !== undefined && value !== null && text(value)) return text(value);
  }
  return '';
}

function redactContent(raw) {
  return text(raw)
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}\b/g, '[PHONE]')
    .replace(/\b\d{9,}\b/g, '[ID]')
    .replace(/\b(token|secret|cookie|session|authorization)\s*[:=]\s*\S+/ig, (_, key) => `${key}=[REDACTED]`)
    .slice(0, 500);
}

function extractSkus(raw) {
  return [...new Set(text(raw).replace(/B[0-9A-Z]{9}/ig, ' ').match(/\b[A-Z]{2,6}\d{3,5}[A-Z0-9-]*\b/g) || [])]
    .map(item => item.toUpperCase());
}

function extractAsins(raw) {
  return [...new Set(text(raw).match(/(?:\/dp\/|\/gp\/product\/|\b)(B[0-9A-Z]{9})(?:[/?\s]|$)/ig) || [])]
    .map(item => {
      const match = item.match(/B[0-9A-Z]{9}/i);
      return match ? match[0].toUpperCase() : '';
    })
    .filter(Boolean);
}

function extractKeywords(raw) {
  const values = [];
  const input = text(raw);
  for (const match of input.matchAll(/`([^`]{2,80})`/g)) values.push(match[1]);
  for (const match of input.matchAll(/["“”']([^"“”']{2,80})["“”']/g)) values.push(match[1]);
  const keyword = input.match(/(?:关键词|这个词|keyword)\s*[:：]?\s*([a-z0-9][a-z0-9 -]{2,80})/i);
  if (keyword) values.push(keyword[1]);
  return [...new Set(values.map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function includesAny(value, needles) {
  const haystack = text(value).toLowerCase();
  return list(needles).some(needle => haystack.includes(needle.toLowerCase()));
}

function detectMentions(rawContent, raw = {}, config = {}) {
  if (raw.is_at_me === true || raw.isAtMe === true || raw.atMe === true) return true;
  const atList = list(raw.at_list || raw.atList || raw.ats || raw.data?.at_list || raw.data?.atList);
  if (atList.length && includesAny(atList.join(' '), config.operatorAliases)) return true;
  return list(config.operatorAliases).some(alias => text(rawContent).includes(`@${alias}`) || text(rawContent).includes(alias));
}

function classifyWecomMessage(rawContent) {
  const value = text(rawContent).toLowerCase();
  if (/开发|产品诉求|新品|能不能推|没流量|曝光|点击没了|加广告|listing|标题|卖点|search term/i.test(value)) {
    return 'developer_product_inquiry';
  }
  if (/会议|开会|纪要|学习资料|培训|文档|资料|复盘|同步|meeting|minutes|training|doc/i.test(value)) {
    return 'meeting_or_learning_material';
  }
  if (/舆情|投诉|差评|异常|事故|风险|紧急|老板|升级|客诉|预警|blocked|urgent|risk|issue/i.test(value)) {
    return 'sentiment_or_exception_watch';
  }
  return 'general_notification';
}

function priorityForEvent(category, rawContent, immediate) {
  const value = text(rawContent);
  if (immediate || /紧急|马上|今天|老板|风险|异常|事故|投诉|P0|urgent/i.test(value)) return 'P0';
  if (category === 'developer_product_inquiry' || category === 'sentiment_or_exception_watch') return 'P1';
  return 'P2';
}

function chatTypeFor(raw = {}, roomDisplay = '') {
  const explicit = text(raw.chatType || raw.type || raw.data?.chatType);
  if (/group|room|群/i.test(explicit)) return 'group';
  if (roomDisplay || raw.room_id || raw.roomId || raw.data?.room_id || raw.data?.roomId) return 'group';
  return 'direct';
}

function isWhitelisted(value, whitelist = []) {
  if (!list(whitelist).length) return false;
  return includesAny(value, whitelist);
}

function shouldPushImmediate(event = {}, config = {}) {
  if (event.chatType === 'group') {
    return event.mentionsOperator && isWhitelisted(event.roomDisplay, config.groupWhitelist);
  }
  return isWhitelisted(event.senderDisplay, config.directSenderWhitelist);
}

function buildReviewDraft(event = {}, rawContent = '') {
  const safeContent = event.redactedSummary || redactContent(rawContent);
  if (event.chatContext?.state === 'waiting_external_confirmation') {
    return {
      suggestedReply: '暂不追问，等对方确认后再处理。',
      suggestedAction: '标记为等待对方确认；下次摘要只保留状态，不作为即时待回复。',
      missingEvidence: [],
    };
  }
  if (event.chatContext?.state === 'closed_or_archivable') {
    return {
      suggestedReply: '不需要回复，可归档。',
      suggestedAction: '标记为已闭环或归档；如后续对方提出新问题，再重新进入待审。',
      missingEvidence: [],
    };
  }
  if (event.category === 'developer_product_inquiry') {
    const task = parseExternalRequest(safeContent, {
      runAt: event.receivedAt,
      businessDate: event.businessDate,
      dataDate: event.businessDate,
      sourceRunId: `wecom_${event.messageHash.slice(0, 10)}`,
    });
    return {
      suggestedReply: '先不要直接承诺已处理。建议按产品判断、当前证据、拟处理动作和下一复查点整理一段可转发回复。',
      suggestedAction: '进入开发诉求轻闭环：查 GBrain -> 看产品/市场 -> 读取必要广告/库存/listing证据；涉及广告时先按 D:\\ad-ops-brain\\playbooks\\广告调整完整结构.md 写清目标、范围、问题规模、现有/待新增投放层和覆盖缺口 -> 只列可逆动作建议，等待人工审核。',
      missingEvidence: task.evidenceRequirements || [],
      agentTask: task,
    };
  }
  if (event.category === 'meeting_or_learning_material') {
    return {
      suggestedReply: '已收到，建议先摘要成待办和需要沉淀的规则，再决定是否写入 GBrain。',
      suggestedAction: '提取会议/学习资料的决定、负责人、截止时间和可复用规则。',
      missingEvidence: ['原文或附件内容', '是否需要形成长期规则'],
    };
  }
  if (event.category === 'sentiment_or_exception_watch') {
    return {
      suggestedReply: '先确认是否影响今天动作或账号/客户风险，再决定是否升级处理。',
      suggestedAction: '标记为异常监控：确认来源、影响范围、是否提到 SKU/ASIN/账号风险。',
      missingEvidence: ['影响范围', '是否需要实时读取业务系统'],
    };
  }
  return {
    suggestedReply: '普通通知，默认不需要业务动作。',
    suggestedAction: '仅归档摘要；如包含截止时间或资料链接，再转为待办。',
    missingEvidence: [],
  };
}

function normalizeVworkMessage(raw = {}, config = {}, now = new Date()) {
  const rawContent = pick(raw, [
    'msg',
    'content',
    'message',
    'text',
    'data.msg',
    'data.content',
    'data.message',
    'data.text',
  ]);
  const senderDisplay = pick(raw, [
    'senderDisplay',
    'sender_name',
    'senderName',
    'from_name',
    'fromName',
    'user_name',
    'userName',
    'user_id',
    'userId',
    'from',
    'data.sender_name',
    'data.senderName',
    'data.user_name',
    'data.user_id',
  ]);
  const roomDisplay = pick(raw, [
    'roomDisplay',
    'room_name',
    'roomName',
    'room_id',
    'roomId',
    'conversation',
    'data.room_name',
    'data.roomName',
    'data.room_id',
    'data.roomId',
  ]);
  const chatType = chatTypeFor(raw, roomDisplay);
  const receivedAt = text(raw.receivedAt || raw.timestamp || raw.createTime || raw.data?.timestamp) || now.toISOString();
  const businessDate = dateOnly(receivedAt, config.timezone);
  const mentionsOperator = detectMentions(rawContent, raw, config);
  const category = classifyWecomMessage(rawContent);
  const base = {
    source: 'wecom',
    messageId: pick(raw, ['messageId', 'message_id', 'msg_id', 'id', 'data.messageId', 'data.msg_id']) || '',
    messageHash: stableHash([receivedAt, senderDisplay, roomDisplay, rawContent]),
    receivedAt,
    businessDate,
    chatType,
    senderDisplay,
    roomDisplay,
    mentionsOperator,
    redactedSummary: redactContent(rawContent),
    detectedSubjects: {
      skus: extractSkus(rawContent),
      asins: extractAsins(rawContent),
      keywords: extractKeywords(rawContent),
    },
    category,
    priority: 'P2',
    routingReason: '',
    reviewStatus: 'new',
    attachments: list(raw.attachments || raw.files || raw.data?.attachments),
  };
  const immediate = shouldPushImmediate(base, config);
  base.priority = priorityForEvent(category, rawContent, immediate);
  base.routingReason = immediate
    ? (chatType === 'group' ? 'whitelisted_group_mention' : 'whitelisted_direct_sender')
    : 'scheduled_digest';
  return {
    ...base,
    immediate,
    reviewDraft: buildReviewDraft(base, rawContent),
  };
}

function dailyMessageFile(outDir, businessDate) {
  return path.join(outDir || DEFAULT_CONFIG.outDir, `wecom_messages_${businessDate}.json`);
}

function digestFile(outDir, businessDate, slot = '') {
  const suffix = slot ? `_${slot.replace(/:/g, '')}` : '';
  return path.join(outDir || DEFAULT_CONFIG.outDir, `wecom_digest_${businessDate}${suffix}.json`);
}

function promptFile(outDir, businessDate, slot = '') {
  const suffix = slot ? `_${slot.replace(/:/g, '')}` : '';
  return path.join(outDir || DEFAULT_CONFIG.outDir, `wecom_codex_prompt_${businessDate}${suffix}.md`);
}

function appendMessageEvent(event, options = {}) {
  const file = options.file || dailyMessageFile(options.outDir, event.businessDate);
  const current = readJson(file, { generatedAt: new Date().toISOString(), businessDate: event.businessDate, messages: [] });
  const messages = Array.isArray(current.messages) ? current.messages : [];
  const existing = messages.find(item => item.messageHash === event.messageHash);
  if (!existing) messages.push(event);
  const next = {
    generatedAt: new Date().toISOString(),
    businessDate: event.businessDate,
    summary: summarizeEvents(messages),
    messages,
  };
  writeJson(file, next);
  return { file, event: existing || event, inserted: !existing, store: next };
}

function eventFromOcrTriage(triage = {}, options = {}) {
  const receivedAt = text(options.receivedAt) || new Date().toISOString();
  const businessDate = text(options.businessDate) || dateOnly(receivedAt, options.timezone || DEFAULT_CONFIG.timezone);
  const preview = text(triage.textPreview);
  const subjects = triage.detectedSubjects || {};
  const subjectText = [
    ...(subjects.skus || []),
    ...(subjects.asins || []),
    ...(subjects.keywords || []),
  ].join(' ');
  const chatContext = triage.chatContext || {};
  const aliases = (options.operatorAliases || []).map(text).filter(Boolean);
  const mentionsOperator = /@(?:我|operator|me)\b/i.test(preview) || aliases.some(alias => preview.includes(`@${alias}`));
  const redactedSummary = [
    'OCR window scan',
    triage.category ? `category=${triage.category}` : '',
    chatContext.state ? `state=${chatContext.state}` : '',
    subjectText ? `subjects=${subjectText}` : '',
    chatContext.latestIncoming ? `latestIncoming=${redactContent(chatContext.latestIncoming).slice(0, 160)}` : '',
    chatContext.yourLastMessage ? `yourLast=${redactContent(chatContext.yourLastMessage).slice(0, 160)}` : '',
    preview ? `preview=${redactContent(preview).slice(0, 240)}` : '',
  ].filter(Boolean).join('; ');
  const event = {
    source: 'wecom_window_ocr',
    messageId: text(triage.image || options.sourceFile || ''),
    messageHash: stableHash(['wecom_window_ocr', businessDate, triage.image || options.sourceFile || '', redactedSummary]),
    receivedAt,
    businessDate,
    chatType: 'window_scan',
    senderDisplay: 'WeCom OCR',
    roomDisplay: 'Current WeCom Window',
    mentionsOperator,
    redactedSummary,
    detectedSubjects: {
      skus: subjects.skus || [],
      asins: subjects.asins || [],
      keywords: subjects.keywords || [],
    },
    category: text(triage.category || 'general_notification'),
    priority: text(triage.priority || 'P2'),
    routingReason: 'window_ocr_scan',
    reviewStatus: 'new',
    attachments: [triage.image].filter(Boolean),
    chatContext,
    immediate: text(triage.priority) === 'P0',
  };
  return {
    ...event,
    reviewDraft: buildReviewDraft(event, redactedSummary),
  };
}

function summarizeEvents(events = []) {
  return {
    total: events.length,
    byCategory: events.reduce((acc, event) => {
      acc[event.category] = (acc[event.category] || 0) + 1;
      return acc;
    }, {}),
    byPriority: events.reduce((acc, event) => {
      acc[event.priority] = (acc[event.priority] || 0) + 1;
      return acc;
    }, {}),
    immediate: events.filter(event => event.immediate).length,
    pendingReview: events.filter(event => !['reviewed', 'ignored'].includes(event.reviewStatus)).length,
  };
}

function buildCodexPrompt(digest = {}) {
  const lines = [
    `# 企业微信待审摘要 ${digest.businessDate}${digest.slot ? ` ${digest.slot}` : ''}`,
    '',
    '边界：只拟回复和列做法，不自动发企微、不自动执行广告/listing/价格/库存动作。',
    '',
    `总数：${digest.summary.total}；P0：${digest.summary.byPriority.P0 || 0}；P1：${digest.summary.byPriority.P1 || 0}；P2：${digest.summary.byPriority.P2 || 0}`,
    '',
  ];
  digest.items.forEach((event, index) => {
    lines.push(`## ${index + 1}. [${event.priority}] ${CATEGORY_LABELS[event.category] || event.category}`);
    lines.push(`来源：${event.chatType === 'group' ? event.roomDisplay || '群聊' : event.senderDisplay || '私聊'}；路由：${event.routingReason}`);
    lines.push(`摘要：${event.redactedSummary || '(空)'}`);
    const subjects = [
      event.detectedSubjects?.skus?.length ? `SKU ${event.detectedSubjects.skus.join(', ')}` : '',
      event.detectedSubjects?.asins?.length ? `ASIN ${event.detectedSubjects.asins.join(', ')}` : '',
      event.detectedSubjects?.keywords?.length ? `关键词 ${event.detectedSubjects.keywords.join(', ')}` : '',
    ].filter(Boolean).join('；');
    if (subjects) lines.push(`识别对象：${subjects}`);
    lines.push(`建议做法：${event.reviewDraft?.suggestedAction || ''}`);
    lines.push(`拟回复：${event.reviewDraft?.suggestedReply || ''}`);
    if (event.reviewDraft?.missingEvidence?.length) lines.push(`缺证据：${event.reviewDraft.missingEvidence.join(', ')}`);
    lines.push('审核选项：回复 / 忽略 / 转人工 / 让 AI 查证据');
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}

function buildDigest(options = {}) {
  const config = options.config || DEFAULT_CONFIG;
  const businessDate = dateOnly(options.today || new Date(), config.timezone);
  const sourceFile = options.sourceFile || dailyMessageFile(options.outDir || config.outDir, businessDate);
  const store = readJson(sourceFile, { messages: [] });
  const messages = Array.isArray(store.messages) ? store.messages : [];
  const items = messages
    .filter(event => !['reviewed', 'ignored'].includes(event.reviewStatus))
    .sort((a, b) => (a.priority || 'P9').localeCompare(b.priority || 'P9') || text(a.receivedAt).localeCompare(text(b.receivedAt)));
  const digest = {
    generatedAt: new Date().toISOString(),
    businessDate,
    slot: text(options.slot),
    codexThreadId: text(options.codexThreadId || config.codexThreadId),
    summary: summarizeEvents(items),
    sourceFile,
    items,
  };
  digest.prompt = buildCodexPrompt(digest);
  return digest;
}

function writeDigest(digest, options = {}) {
  const outDir = options.outDir || DEFAULT_CONFIG.outDir;
  const jsonFile = options.outFile || digestFile(outDir, digest.businessDate, digest.slot);
  const mdFile = options.promptOut || promptFile(outDir, digest.businessDate, digest.slot);
  writeJson(jsonFile, digest);
  fs.mkdirSync(path.dirname(mdFile), { recursive: true });
  fs.writeFileSync(mdFile, digest.prompt, 'utf8');
  return { jsonFile, mdFile };
}

function cleanupWecomFiles(options = {}) {
  const outDir = options.outDir || DEFAULT_CONFIG.outDir;
  const retentionDays = Number(options.retentionDays || DEFAULT_CONFIG.retentionDays);
  const today = dateOnly(options.today || new Date(), options.timezone || DEFAULT_CONFIG.timezone);
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const deleted = [];
  if (!fs.existsSync(outDir)) return { today, retentionDays, deleted };
  for (const name of fs.readdirSync(outDir)) {
    if (!/^wecom_(messages|digest|codex_prompt)_\d{4}-\d{2}-\d{2}/.test(name)) continue;
    const match = name.match(/_(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;
    const fileDate = new Date(`${match[1]}T00:00:00.000Z`);
    if (fileDate >= cutoff) continue;
    const file = path.join(outDir, name);
    fs.unlinkSync(file);
    deleted.push(file);
  }
  return { today, retentionDays, deleted };
}

function queryProviderApi(payload = {}, config = {}) {
  const body = JSON.stringify(payload);
  const apiHost = config.apiHost || config.dllHost || DEFAULT_CONFIG.apiHost;
  const apiPort = Number(config.apiPort || config.dllPort || DEFAULT_CONFIG.apiPort);
  const apiPath = config.apiPath || DEFAULT_CONFIG.apiPath;
  const requestOptions = {
    hostname: apiHost,
    port: apiPort,
    path: apiPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(requestOptions, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ statusCode: res.statusCode, body: raw ? JSON.parse(raw) : null });
        } catch (error) {
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const queryVworkApi = queryProviderApi;

function startGateway(options = {}) {
  const config = options.config || DEFAULT_CONFIG;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'wecom_gateway' }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/msg') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const event = normalizeVworkMessage(raw, config, new Date());
        const result = appendMessageEvent(event, { outDir: config.outDir });
        if (event.immediate) {
          const digest = {
            generatedAt: new Date().toISOString(),
            businessDate: event.businessDate,
            slot: 'immediate',
            codexThreadId: text(config.codexThreadId),
            summary: summarizeEvents([event]),
            sourceFile: result.file,
            items: [event],
          };
          digest.prompt = buildCodexPrompt(digest);
          writeDigest(digest, { outDir: config.outDir, outFile: digestFile(config.outDir, event.businessDate, 'immediate'), promptOut: promptFile(config.outDir, event.businessDate, 'immediate') });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, inserted: result.inserted, immediate: event.immediate, messageHash: event.messageHash }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  });
  server.listen(Number(config.callbackPort), config.callbackHost);
  return server;
}

module.exports = {
  CATEGORY_LABELS,
  DEFAULT_CONFIG,
  PROVIDER_DEFAULTS,
  appendMessageEvent,
  buildCodexPrompt,
  buildDigest,
  cleanupWecomFiles,
  dailyMessageFile,
  dateOnly,
  eventFromOcrTriage,
  loadConfig,
  normalizeVworkMessage,
  queryProviderApi,
  queryVworkApi,
  redactContent,
  shouldPushImmediate,
  startGateway,
  writeDigest,
};
