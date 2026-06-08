const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runImportOcrTriage,
  shouldImport,
} = require('../scripts/run_wecom_import_ocr_triage');

{
  assert.strictEqual(shouldImport({ category: 'general_notification', priority: 'P2', detectedSubjects: {} }), false);
  assert.strictEqual(shouldImport({ category: 'general_notification', priority: 'P2', detectedSubjects: { skus: ['QA3281'] } }), true);
  assert.strictEqual(shouldImport({ category: 'sentiment_or_exception_watch', priority: 'P2', detectedSubjects: {} }), true);
  assert.strictEqual(shouldImport({ category: 'general_notification', priority: 'P0', detectedSubjects: {} }), true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-import-ocr-'));
  const configFile = path.join(tmpDir, 'config.json');
  const triageFile = path.join(tmpDir, 'triage.json');
  fs.writeFileSync(configFile, JSON.stringify({
    outDir: tmpDir,
    timezone: 'Asia/Shanghai',
    operatorAliases: ['黄成哲'],
  }), 'utf8');
  fs.writeFileSync(triageFile, JSON.stringify({
    triage: {
      image: path.join(tmpDir, 'capture.png'),
      category: 'developer_product_inquiry',
      priority: 'P0',
      textPreview: '@黄成哲 开发问 QA3281 为什么没流量',
      detectedSubjects: {
        skus: ['QA3281'],
        asins: [],
        keywords: [],
      },
    },
  }), 'utf8');

  const result = runImportOcrTriage({
    configFile,
    triageFile,
    today: '2026-06-04',
  });
  assert.strictEqual(result.imported, true);
  assert.strictEqual(result.inserted, true);
  assert.ok(fs.existsSync(result.outFile));

  const stored = JSON.parse(fs.readFileSync(result.outFile, 'utf8'));
  assert.strictEqual(stored.messages.length, 1);
  assert.strictEqual(stored.messages[0].source, 'wecom_window_ocr');
  assert.strictEqual(stored.messages[0].mentionsOperator, true);
  assert.deepStrictEqual(stored.messages[0].detectedSubjects.skus, ['QA3281']);

  const duplicate = runImportOcrTriage({
    configFile,
    triageFile,
    today: '2026-06-04',
  });
  assert.strictEqual(duplicate.inserted, false);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-skip-ocr-'));
  const triageFile = path.join(tmpDir, 'triage.json');
  fs.writeFileSync(triageFile, JSON.stringify({
    category: 'general_notification',
    priority: 'P2',
    textPreview: '普通窗口文字',
    detectedSubjects: { skus: [], asins: [], keywords: [] },
  }), 'utf8');
  const result = runImportOcrTriage({
    triageFile,
    outDir: tmpDir,
    today: '2026-06-04',
  });
  assert.strictEqual(result.imported, false);
  assert.ok(!fs.existsSync(path.join(tmpDir, 'wecom_messages_2026-06-04.json')));
}

console.log('wecom_import_ocr_triage tests passed');
