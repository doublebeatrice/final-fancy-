const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const DEFAULT_BOT_TYPE = '3';
const DEFAULT_BOT_AGENT = 'CodexAdOps/0.1.0';
const DEFAULT_PLUGIN_VERSION = '2.4.4';
const DEFAULT_ILINK_APP_ID = 'bot';

function text(value) {
  return String(value ?? '').trim();
}

function ensureBaseUrl(value) {
  return text(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function endpointUrl(baseUrl, endpoint) {
  return `${ensureBaseUrl(baseUrl)}/${text(endpoint).replace(/^\/+/, '')}`;
}

function buildClientVersion(version = DEFAULT_PLUGIN_VERSION) {
  const [major = 0, minor = 0, patch = 0] = text(version)
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

function defaultRandomUin() {
  return String(crypto.randomBytes(4).readUInt32BE(0));
}

function buildBaseInfo(options = {}) {
  return {
    channel_version: text(options.channelVersion || DEFAULT_PLUGIN_VERSION),
    bot_agent: text(options.botAgent || DEFAULT_BOT_AGENT),
  };
}

function buildHeaders(options = {}) {
  const rawUin = text((options.randomUin || defaultRandomUin)());
  const headers = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(rawUin, 'utf8').toString('base64'),
    'iLink-App-Id': text(options.ilinkAppId || DEFAULT_ILINK_APP_ID),
    'iLink-App-ClientVersion': String(buildClientVersion(options.channelVersion || DEFAULT_PLUGIN_VERSION)),
  };
  if (text(options.token)) headers.Authorization = `Bearer ${text(options.token)}`;
  return headers;
}

function clientId(prefix = 'codex-weixin') {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function buildSendTextBody(options = {}) {
  return {
    msg: {
      from_user_id: '',
      to_user_id: text(options.toUserId),
      client_id: text(options.clientId || clientId()),
      message_type: 2,
      message_state: 2,
      item_list: text(options.text) ? [{
        type: 1,
        text_item: { text: text(options.text) },
      }] : undefined,
      context_token: text(options.contextToken) || undefined,
    },
  };
}

function normalizeQrStatus(raw = {}) {
  const status = text(raw.status || raw.ret || 'unknown');
  return {
    status,
    connected: status === 'confirmed' && Boolean(text(raw.bot_token)),
    token: text(raw.bot_token),
    accountId: text(raw.ilink_bot_id),
    baseUrl: text(raw.baseurl || raw.baseUrl || DEFAULT_BASE_URL),
    userId: text(raw.ilink_user_id),
    needsVerifyCode: status === 'need_verifycode',
  };
}

function parseJson(rawText, label) {
  try {
    return JSON.parse(rawText || '{}');
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function readResponse(response, label) {
  const rawText = await response.text();
  if (!response.ok) throw new Error(`${label} ${response.status}: ${rawText}`);
  return parseJson(rawText, label);
}

function createWeixinClawbotClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required');
  }
  const baseUrl = ensureBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const headerOptions = {
    token: options.token,
    randomUin: options.randomUin,
    channelVersion: options.channelVersion,
    ilinkAppId: options.ilinkAppId,
  };

  async function postJson(endpoint, body, label) {
    const requestBody = JSON.stringify({
      ...body,
      base_info: body.base_info || buildBaseInfo(options),
    });
    const response = await fetchImpl(endpointUrl(baseUrl, endpoint), {
      method: 'POST',
      headers: buildHeaders(headerOptions),
      body: requestBody,
    });
    return readResponse(response, label);
  }

  async function getJson(endpoint, label) {
    const response = await fetchImpl(endpointUrl(baseUrl, endpoint), {
      method: 'GET',
      headers: buildHeaders({ ...headerOptions, token: '' }),
    });
    return readResponse(response, label);
  }

  return {
    startLogin: (loginOptions = {}) => postJson(
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(loginOptions.botType || DEFAULT_BOT_TYPE)}`,
      { local_token_list: loginOptions.localTokenList || [] },
      'getBotQrCode',
    ),
    pollLogin: async (loginOptions = {}) => normalizeQrStatus(await getJson(
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(loginOptions.qrcode || '')}${loginOptions.verifyCode ? `&verify_code=${encodeURIComponent(loginOptions.verifyCode)}` : ''}`,
      'getQrCodeStatus',
    )),
    getUpdates: (updatesOptions = {}) => postJson(
      'ilink/bot/getupdates',
      { get_updates_buf: text(updatesOptions.cursor) },
      'getUpdates',
    ),
    sendText: (sendOptions = {}) => postJson(
      'ilink/bot/sendmessage',
      buildSendTextBody(sendOptions),
      'sendMessage',
    ),
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_BOT_AGENT,
  DEFAULT_BOT_TYPE,
  buildBaseInfo,
  buildClientVersion,
  buildHeaders,
  buildSendTextBody,
  createWeixinClawbotClient,
  endpointUrl,
  normalizeQrStatus,
};
