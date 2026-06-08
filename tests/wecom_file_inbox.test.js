const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  appendFileItems,
  buildFilePrompt,
  classifyFile,
  normalizeFileItem,
} = require('../src/wecom_file_inbox');
const { runWecomFileInbox } = require('../scripts/run_wecom_file_inbox');

{
  assert.strictEqual(classifyFile('a.xlsx'), 'spreadsheet');
  assert.strictEqual(classifyFile('a.pdf'), 'pdf');
  assert.strictEqual(classifyFile('a.png'), 'image');
  assert.strictEqual(classifyFile('a.docx'), 'document');
  assert.strictEqual(classifyFile('a.pptx'), 'presentation');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-file-inbox-'));
  const file = path.join(tmpDir, '开发资料.xlsx');
  fs.writeFileSync(file, 'hello', 'utf8');
  const item = normalizeFileItem(file, {
    receivedAt: '2026-06-04T01:00:00.000Z',
    note: '会议资料',
  });
  assert.strictEqual(item.category, 'spreadsheet');
  assert.strictEqual(item.fileName, '开发资料.xlsx');
  assert.strictEqual(item.businessDate, '2026-06-04');
  assert.ok(item.fileId);

  const outDir = path.join(tmpDir, 'out');
  const first = appendFileItems([file], { outDir, today: '2026-06-04', note: '会议资料' });
  const second = appendFileItems([file], { outDir, today: '2026-06-04', note: '会议资料' });
  assert.strictEqual(first.inbox.summary.total, 1);
  assert.strictEqual(second.inbox.summary.total, 1);
  const prompt = buildFilePrompt(second.inbox);
  assert.ok(prompt.includes('企业微信文件待审'));
  assert.ok(prompt.includes('开发资料.xlsx'));
  assert.ok(prompt.includes(file));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-file-inbox-cli-'));
  const file = path.join(tmpDir, 'meeting.md');
  fs.writeFileSync(file, 'meeting notes', 'utf8');
  const outDir = path.join(tmpDir, 'out');
  const result = runWecomFileInbox({
    file,
    outDir,
    today: '2026-06-04',
    note: 'from wecom',
  });
  assert.ok(fs.existsSync(result.outFile));
  assert.ok(fs.existsSync(result.promptOut));
  assert.strictEqual(result.inbox.summary.total, 1);
}

console.log('wecom_file_inbox tests passed');
