const fs = require('fs');
const path = require('path');

const DISCOVERY_ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(DISCOVERY_ROOT, 'output');
const DOCS_DIR = path.join(DISCOVERY_ROOT, 'docs');
const FIXTURES_DIR = path.join(DISCOVERY_ROOT, 'fixtures');

const DANGEROUS_TEXT_RE = /保存|提交|确认|删除|导入|导出写入|批量|新建|编辑|修改|执行|提报|审核通过|驳回|approve|submit|save|delete|remove|import|batch|create|edit|execute/i;
const SAFE_READ_ACTION_RE = /^(查询|搜索|刷新|筛选|查看|加载|获取|Search|Query|Refresh|Filter|View|Load)$/i;
const SENSITIVE_KEY_RE = /cookie|authorization|inventory-token|jwt-token|x-csrf-token|x-xsrf-token|csrf|token|jwt|password|secret|surfacekey/i;

function todayYmd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureDiscoveryDirs() {
  for (const dir of [OUTPUT_DIR, DOCS_DIR, FIXTURES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeString(value) {
  return String(value)
    .replace(/(Inventory-Token=)[^&#\s"']+/ig, '$1<redacted>')
    .replace(/((?:jwt-token|x-csrf-token|x-xsrf-token|csrf[_-]?token|surfaceKey|authorization|token|jwt|cookie)=)[^&#\s"']+/ig, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/ig, '$1<redacted>')
    .replace(/((?:SESSION|XSRF-TOKEN|JWT|Authorization)[^=;\s]*=)[^;\s"']+/ig, '$1<redacted>');
}

function sanitizeObject(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeObject);
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '<redacted>' : sanitizeObject(raw);
  }
  return out;
}

function isDangerousText(text = '') {
  return DANGEROUS_TEXT_RE.test(String(text || '').replace(/\s+/g, ''));
}

function isSafeReadActionText(text = '') {
  const normalized = String(text || '').replace(/\s+/g, '').trim();
  return !!normalized && !isDangerousText(normalized) && SAFE_READ_ACTION_RE.test(normalized);
}

function safeFilePart(value, fallback = 'unknown') {
  const text = String(value || '').trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function makeOutputName(prefix, id = '', date = todayYmd()) {
  const parts = [prefix, id, date].filter(Boolean).map(part => safeFilePart(part));
  return `${parts.join('_')}.json`;
}

function routeIdFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[^\w.-]+/g, '.') || parsed.hostname;
  } catch (_) {
    return '';
  }
}

function normalizeRouteEntry(input = {}) {
  const attrs = sanitizeObject(input.attrs || {});
  const rawUrl = input.url || attrs['lay-href'] || attrs.href || attrs.src || '';
  const url = sanitizeString(rawUrl);
  let domain = '';
  try {
    domain = new URL(rawUrl).hostname;
  } catch (_) {
    domain = String(input.source || '').trim();
  }
  const visibleText = String(input.text || input.visibleText || '').replace(/\s+/g, ' ').trim();
  const routeId = String(input.routeId || attrs['data-routeid'] || attrs.routeid || routeIdFromUrl(rawUrl) || safeFilePart(visibleText)).trim();
  const riskLevel = isDangerousText(visibleText) ? 'write_or_sensitive_candidate' : 'read_only_candidate';
  return sanitizeObject({
    source: input.source || domain || '',
    domain,
    routeId,
    visibleText,
    url,
    attrs,
    tag: input.tag || '',
    riskLevel,
  });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sanitizeObject(value), null, 2), 'utf8');
}

function findRows(value, acc = []) {
  if (!value || acc.length >= 500) return acc;
  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
      acc.push(...value.slice(0, 500 - acc.length));
      return acc;
    }
    for (const item of value) findRows(item, acc);
    return acc;
  }
  if (typeof value === 'object') {
    for (const key of ['list', 'rows', 'data', 'records', 'items', 'result', 'msg']) {
      if (value[key]) findRows(value[key], acc);
    }
  }
  return acc;
}

function summarizeResponseSample(sample) {
  const rows = findRows(sample, []);
  const firstRow = rows.find(row => row && typeof row === 'object' && !Array.isArray(row)) || null;
  return {
    topLevelKeys: sample && typeof sample === 'object' && !Array.isArray(sample) ? Object.keys(sample).slice(0, 80) : [],
    rowCount: rows.length,
    sampleFields: firstRow ? Object.keys(firstRow).slice(0, 80) : [],
    sampleRow: firstRow || null,
  };
}

module.exports = {
  DISCOVERY_ROOT,
  OUTPUT_DIR,
  DOCS_DIR,
  FIXTURES_DIR,
  ensureDiscoveryDirs,
  todayYmd,
  sanitizeString,
  sanitizeObject,
  isDangerousText,
  isSafeReadActionText,
  safeFilePart,
  makeOutputName,
  normalizeRouteEntry,
  readJson,
  writeJson,
  findRows,
  summarizeResponseSample,
};
