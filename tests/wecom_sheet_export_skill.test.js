const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skillDir = path.join(root, '.codex', 'skills', 'wecom-sheet-export');
const skillFile = path.join(skillDir, 'SKILL.md');
const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');
const scriptFile = path.join(root, 'scripts', 'execute', 'export_wecom_sheet.js');
const builderFile = path.join(root, 'scripts', 'execute', 'build_xlsx_from_sheets.py');

// --- skill definition is present and well-formed for both AI entry points ---
assert(fs.existsSync(skillFile), 'wecom-sheet-export skill must define SKILL.md');

const skill = fs.readFileSync(skillFile, 'utf8');
assert.match(skill, /^---\s*\nname:\s*wecom-sheet-export/m, 'frontmatter must name wecom-sheet-export');
assert.match(skill, /description:\s*>/m, 'frontmatter must include a folded trigger description');
assert.match(skill, /企业微信|WeCom|腾讯表格|Tencent/i, 'skill must document the Tencent/WeCom sheet scope');
assert.match(skill, /导出表格|表格导出|export.*sheet/i, 'skill must document the Chinese/English export trigger words');
assert.match(skill, /canvas/i, 'skill must explain the canvas-rendered cell boundary');
assert.match(skill, /lazy-?load|按需加载|惰性/i, 'skill must explain the lazy-load-per-sheet boundary');
assert.match(skill, /chrome:ready|9222/, 'skill must document the debug-browser prerequisite');
assert.match(skill, /npm run sheet:export/, 'skill must document the npm entry point');
assert.match(skill, /SpreadsheetApp/, 'skill must document the in-memory grid extraction path for maintenance');
assert.match(skill, /hidden|隐藏/i, 'skill must document hidden-sheet handling');
assert.match(skill, /commit.*guard|nothing synced|read-only/i, 'skill must document the read-only / no-sync guarantee');
assert.match(skill, /账号密码/, 'skill must document skipping the credentials sheet by default');
assert.match(skill, /tencent-doc-export/, 'skill must point doc (非表格) cases at tencent-doc-export');
assert.match(skill, /不要.*WebFetch|known dead end|dead ends/i, 'skill must steer away from the WebFetch/copy dead ends');

// --- Codex/OpenAI discovery file ---
assert(fs.existsSync(openaiYaml), 'wecom-sheet-export skill must include agents/openai.yaml');
const yaml = fs.readFileSync(openaiYaml, 'utf8');
assert.match(yaml, /display_name:\s*"[^"]*Sheet[^"]*"/i, 'openai.yaml must expose a clear display name');
assert.match(yaml, /\$wecom-sheet-export/, 'openai.yaml default prompt must mention the skill name');

// --- backing scripts exist ---
assert(fs.existsSync(scriptFile), 'export_wecom_sheet.js must exist');
assert(fs.existsSync(builderFile), 'build_xlsx_from_sheets.py must exist');

// --- node extractor parses and exports its public API ---
const mod = require(scriptFile);
assert.strictEqual(typeof mod.exportWecomSheet, 'function', 'script must export exportWecomSheet');
assert.strictEqual(typeof mod.normalizeDocUrl, 'function', 'script must export normalizeDocUrl');
assert.strictEqual(typeof mod.slugFromUrl, 'function', 'script must export slugFromUrl');

// --- pure helpers behave ---
assert.strictEqual(
  mod.normalizeDocUrl('  see https://doc.weixin.qq.com/sheet/e3_ABC?scode=x  '),
  'https://doc.weixin.qq.com/sheet/e3_ABC?scode=x',
  'normalizeDocUrl must extract the bare URL from surrounding text'
);
assert.throws(() => mod.normalizeDocUrl('no url here'), /No URL/, 'normalizeDocUrl must reject input without a URL');
assert.strictEqual(
  mod.slugFromUrl('https://doc.weixin.qq.com/sheet/e3_ABC?scode=x'),
  'e3_ABC',
  'slugFromUrl must pull the sheet id'
);

// --- npm entry points are registered for both AI sessions ---
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  pkg.scripts['sheet:export'], 'node scripts/execute/export_wecom_sheet.js',
  'package.json must register the sheet:export entry point'
);
assert.strictEqual(
  pkg.scripts['sheet:build'], 'python scripts/execute/build_xlsx_from_sheets.py',
  'package.json must register the sheet:build entry point'
);

console.log('wecom_sheet_export_skill tests passed');
