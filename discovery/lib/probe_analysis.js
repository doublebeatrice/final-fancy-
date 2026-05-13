const { sanitizeString } = require('./common');

const URL_LITERAL_RE = /['"`]((?:https?:\/\/[^'"`\s]+|\/[A-Za-z0-9][^'"`\s]*?))['"`]/g;
const METHOD_NEAR_RE = /(fetch|axios\.(get|post|put|patch|delete)|\$\.(get|post)|method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`])/i;
const SENSITIVE_PATH_RE = /token|csrf|password|logout|changeUser|authorization|cookie/i;
const STATIC_ASSET_RE = /\.(?:js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico|map)(?:[?#].*)?$/i;
const WRITE_PATH_RE = /save|submit|delete|remove|update|upload|import|batch|approve|reject|execute|create|edit|downLoad|download|export/i;
const READ_PATH_RE = /get|list|query|search|find|chart|data|analysis|detail|index|sale|product|problem|ranking|performance|success|inventory|stock/i;
const COMMON_NOISE_PATH_RE = /^\/api\/note\/(?:detail|save)\b/i;

function normalizePath(raw = '') {
  const cleaned = sanitizeString(raw).replace(/\\\//g, '/');
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const url = new URL(cleaned);
      return `${url.pathname}${url.search || ''}`;
    } catch (_) {
      return '';
    }
  }
  return cleaned;
}

function inferMethod(text, index) {
  const windowText = text.slice(Math.max(0, index - 120), Math.min(text.length, index + 160));
  const methodMatch = windowText.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (methodMatch) return methodMatch[1].toUpperCase();
  if (/\$\.post|axios\.post/i.test(windowText)) return 'POST';
  if (/\$\.get|axios\.get/i.test(windowText)) return 'GET';
  return METHOD_NEAR_RE.test(windowText) ? 'UNKNOWN' : '';
}

function classifyEndpointCandidate(candidate = {}) {
  const method = String(candidate.method || '').toUpperCase();
  const path = String(candidate.path || '');
  const reasons = [];
  let risk = 'unknown';

  if (COMMON_NOISE_PATH_RE.test(path)) {
    return { risk: 'common_noise', reasons: ['common_page_note_endpoint'] };
  }
  if (method === 'DELETE' || method === 'PUT' || method === 'PATCH') {
    risk = 'write_or_sensitive';
    reasons.push('write_method');
  }
  if (WRITE_PATH_RE.test(path)) {
    risk = 'write_or_sensitive';
    reasons.push('write_path');
  }
  if (risk !== 'write_or_sensitive' && (method === 'GET' || method === 'POST' || method === 'UNKNOWN') && READ_PATH_RE.test(path)) {
    risk = 'safe_read_candidate';
    reasons.push('read_path');
  }
  if (method === 'POST' && risk === 'safe_read_candidate') {
    reasons.push('post_query_candidate');
  }
  return { risk, reasons };
}

function extractEndpointCandidates(text = '') {
  const candidates = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(URL_LITERAL_RE)) {
    const raw = match[1];
    const path = normalizePath(raw);
    if (!path || !path.startsWith('/')) continue;
    if (STATIC_ASSET_RE.test(path)) continue;
    if (SENSITIVE_PATH_RE.test(path)) continue;
    const method = inferMethod(text, match.index || 0);
    if (!method && !/api|list|query|search|index|get|find|chart|data|analysis|sale|product|problem|ranking|performance/i.test(path)) continue;
    const key = `${method || 'UNKNOWN'}::${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = {
      path,
      method: method || 'UNKNOWN',
      evidence: String(text).slice(Math.max(0, (match.index || 0) - 80), Math.min(String(text).length, (match.index || 0) + raw.length + 120)).replace(/\s+/g, ' ').trim(),
    };
    candidates.push({
      ...candidate,
      ...classifyEndpointCandidate(candidate),
    });
  }
  return candidates;
}

function summarizeEndpointCandidates(candidates = []) {
  const summary = {
    total: 0,
    safeRead: 0,
    writeOrSensitive: 0,
    unknown: 0,
    commonNoise: 0,
  };
  for (const candidate of candidates || []) {
    const risk = candidate.risk || classifyEndpointCandidate(candidate).risk;
    summary.total += 1;
    if (risk === 'safe_read_candidate') summary.safeRead += 1;
    else if (risk === 'write_or_sensitive') summary.writeOrSensitive += 1;
    else if (risk === 'common_noise') summary.commonNoise += 1;
    else summary.unknown += 1;
  }
  return summary;
}

module.exports = {
  classifyEndpointCandidate,
  extractEndpointCandidates,
  summarizeEndpointCandidates,
};
