const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skillDir = path.join(root, '.codex', 'skills', 'tencent-doc-export');
const skillFile = path.join(skillDir, 'SKILL.md');
const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');
const scriptFile = path.join(root, 'scripts', 'execute', 'export_tencent_doc.js');

// --- skill definition is present and well-formed for both AI entry points ---
assert(fs.existsSync(skillFile), 'tencent-doc-export skill must define SKILL.md');

const skill = fs.readFileSync(skillFile, 'utf8');
assert.match(skill, /^---\s*\nname:\s*tencent-doc-export/m, 'frontmatter must name tencent-doc-export');
assert.match(skill, /description:\s*>/m, 'frontmatter must include a folded trigger description');
assert.match(skill, /企业微信|WeCom|腾讯文档|Tencent/i, 'skill must document the Tencent/WeCom doc scope');
assert.match(skill, /导出文档|文档导出|export.*doc/i, 'skill must document the Chinese/English export trigger words');
assert.match(skill, /canvas/i, 'skill must explain the canvas-rendered body boundary');
assert.match(skill, /禁止.*复制|禁止仅浏览成员复制|copy.*disabl/i, 'skill must explain the copy-disabled boundary');
assert.match(skill, /chrome:ready|9222/, 'skill must document the debug-browser prerequisite');
assert.match(skill, /npm run doc:export/, 'skill must document the npm entry point');
assert.match(skill, /getDocumentBox/, 'skill must document the box-tree extraction path for maintenance');
assert.match(skill, /不要.*WebFetch|known dead end|dead ends/i, 'skill must steer away from the WebFetch/copy dead ends');

// --- Codex/OpenAI discovery file ---
assert(fs.existsSync(openaiYaml), 'tencent-doc-export skill must include agents/openai.yaml');
const yaml = fs.readFileSync(openaiYaml, 'utf8');
assert.match(yaml, /display_name:\s*"[^"]*Doc[^"]*"/i, 'openai.yaml must expose a clear display name');
assert.match(yaml, /\$tencent-doc-export/, 'openai.yaml default prompt must mention the skill name');

// --- backing script exists, parses, and exports the public API ---
assert(fs.existsSync(scriptFile), 'export_tencent_doc.js must exist');
const mod = require(scriptFile);
assert.strictEqual(typeof mod.exportTencentDoc, 'function', 'script must export exportTencentDoc');
assert.strictEqual(typeof mod.normalizeDocUrl, 'function', 'script must export normalizeDocUrl');
assert.strictEqual(typeof mod.normalizeBody, 'function', 'script must export normalizeBody');

// --- pure helpers behave ---
assert.strictEqual(
  mod.normalizeDocUrl('  see https://doc.weixin.qq.com/doc/w3_ABC?scode=x  '),
  'https://doc.weixin.qq.com/doc/w3_ABC?scode=x',
  'normalizeDocUrl must extract the bare URL from surrounding text'
);
assert.throws(() => mod.normalizeDocUrl('no url here'), /No URL/, 'normalizeDocUrl must reject input without a URL');

const body = mod.normalizeBody('标题段\r正文一\r\r\r正文二\r', '我的标题');
assert.match(body, /^# 我的标题\n\n/, 'normalizeBody must prepend a Markdown title header');
assert.match(body, /正文一\n/, 'normalizeBody must turn CR markers into paragraph newlines');
assert.ok(!/\n{3,}/.test(body), 'normalizeBody must collapse 3+ blank lines');

assert.strictEqual(mod.normalizeBody('内容', ''), '内容', 'normalizeBody must omit the header when title is empty');

console.log('tencent_doc_export_skill tests passed');
