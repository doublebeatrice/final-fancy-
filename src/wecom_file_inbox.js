const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { dateOnly } = require('./wecom_gateway');

function text(value) {
  return String(value ?? '').trim();
}

function fileHash(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function classifyFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) return 'image';
  if (['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'].includes(ext)) return 'spreadsheet';
  if (ext === '.pdf') return 'pdf';
  if (['.docx', '.doc', '.txt', '.md'].includes(ext)) return 'document';
  if (['.pptx', '.ppt'].includes(ext)) return 'presentation';
  return 'file';
}

function normalizeFileItem(file, options = {}) {
  const absolutePath = path.resolve(file);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error(`not a file: ${absolutePath}`);
  const receivedAt = text(options.receivedAt) || new Date().toISOString();
  return {
    source: 'wecom_file',
    fileId: fileHash(absolutePath),
    receivedAt,
    businessDate: dateOnly(receivedAt, options.timezone || 'Asia/Shanghai'),
    originalPath: absolutePath,
    fileName: path.basename(absolutePath),
    extension: path.extname(absolutePath).toLowerCase(),
    sizeBytes: stat.size,
    category: classifyFile(absolutePath),
    requestedBy: text(options.requestedBy),
    note: text(options.note),
    reviewStatus: 'new',
  };
}

function inboxFile(outDir, businessDate) {
  return path.join(outDir || path.join('data', 'agent'), `wecom_file_inbox_${businessDate}.json`);
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
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

function summarize(items = []) {
  return {
    total: items.length,
    byCategory: items.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {}),
    pendingReview: items.filter(item => !['reviewed', 'ignored'].includes(item.reviewStatus)).length,
  };
}

function appendFileItems(files = [], options = {}) {
  const items = files.map(file => normalizeFileItem(file, options));
  const businessDate = options.today || items[0]?.businessDate || dateOnly(new Date(), options.timezone || 'Asia/Shanghai');
  const outFile = options.outFile || inboxFile(options.outDir, businessDate);
  const current = readJson(outFile, { generatedAt: new Date().toISOString(), businessDate, items: [] });
  const existing = new Map((current.items || []).map(item => [item.fileId, item]));
  for (const item of items) existing.set(item.fileId, item);
  const nextItems = [...existing.values()].sort((a, b) => text(a.receivedAt).localeCompare(text(b.receivedAt)));
  const next = {
    generatedAt: new Date().toISOString(),
    businessDate,
    summary: summarize(nextItems),
    items: nextItems,
  };
  writeJson(outFile, next);
  return { outFile, added: items.length, inbox: next };
}

function buildFilePrompt(inbox = {}) {
  const lines = [
    `# 企业微信文件待审 ${inbox.businessDate}`,
    '',
    '边界：只登记文件路径和元数据，不复制文件内容；需要分析时由 Codex 按路径读取。',
    '',
    `总数：${inbox.summary?.total || 0}；待审：${inbox.summary?.pendingReview || 0}`,
    '',
  ];
  (inbox.items || []).filter(item => !['reviewed', 'ignored'].includes(item.reviewStatus)).forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.fileName}`);
    lines.push(`类型：${item.category}；大小：${item.sizeBytes} bytes`);
    lines.push(`路径：${item.originalPath}`);
    if (item.note) lines.push(`备注：${item.note}`);
    lines.push('审核选项：读取分析 / 归档 / 忽略');
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}

module.exports = {
  appendFileItems,
  buildFilePrompt,
  classifyFile,
  inboxFile,
  normalizeFileItem,
};
