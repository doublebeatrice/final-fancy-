const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skillDir = path.join(root, '.codex', 'skills', 'developer-product-inquiry');
const skillFile = path.join(skillDir, 'SKILL.md');
const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');

assert(fs.existsSync(skillFile), 'developer-product-inquiry skill must define SKILL.md');

const skill = fs.readFileSync(skillFile, 'utf8');

assert.match(skill, /^---\s*\nname:\s*developer-product-inquiry/m, 'frontmatter must name developer-product-inquiry');
assert.match(skill, /description:\s*>/m, 'frontmatter must include a folded trigger description');
assert.match(skill, /企微|微信|WeCom/i, 'skill must document the message-source boundary');
assert.match(skill, /转发/, 'skill must require the operator to forward source messages');
assert.match(skill, /触发词：开发诉求、开发/, 'skill must document the short Chinese trigger words');
assert.match(skill, /产品判断/, 'skill must require a product-level judgement');
assert.match(skill, /节点|季节|流量窗口|搜索热度/, 'skill must require season/window evidence, not only ad metrics');
assert.match(skill, /不要只停留在广告层面|不能只写广告指标|不只看广告/, 'skill must forbid ad-only replies');
assert.match(skill, /跟进节点|复查节点|follow-up/i, 'skill must require planned follow-up checkpoints');
assert.match(skill, /可直接转发|直接发给对方/, 'skill must require human-ready reply drafts');
assert.match(skill, /不要编造|缺数据/, 'skill must require explicit handling of missing evidence');

assert(fs.existsSync(openaiYaml), 'developer-product-inquiry skill must include agents/openai.yaml');

const yaml = fs.readFileSync(openaiYaml, 'utf8');
assert.match(yaml, /display_name:\s*"Developer Product Inquiry"/, 'openai.yaml must expose a clear display name');
assert.match(yaml, /\$developer-product-inquiry/, 'openai.yaml default prompt must mention the skill name');

console.log('developer_product_inquiry_skill tests passed');
