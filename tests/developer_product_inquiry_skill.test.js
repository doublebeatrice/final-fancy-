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
assert.match(skill, /过节日产品并写便签/, '必须先过节日产品再写便签');
assert.match(skill, /先过产品，不是先写便签/, '不能把节日产品跟进降级成写便签');
assert.match(skill, /窗口是否还在、库存是否要走、已验证出单方向是什么/, '节日产品必须先判断窗口库存和出单方向');
assert.match(skill, /不限开发诉求/, '便签不能只限开发诉求');
assert.match(skill, /日常巡检/, '日常运营过产品也要写便签');
assert.match(skill, /库存便签|调整日志/, '能安全写 SKU 留痕时要写');
assert.match(skill, /窗口内且库存要走/, '窗口内有走货压力时不能机械降投');
assert.match(skill, /曝光不足、点击率弱还是转化弱/, '必须先拆分流量问题类型');
assert.match(skill, /只收弱泛流量/, '只能收弱泛流量，不能压没核心流量');
assert.match(skill, /找新流量/, '窗口内要主动找新流量');
assert.match(skill, /已验证出单方向/, '新流量优先从已验证出单方向外扩');
assert.match(skill, /同词根、同场景、同人群、同竞品 ASIN/, '新流量外扩要围绕相近已验证方向');
assert.match(skill, /data\/developer_requests\//, '需要复查时必须有持久记录');
assert.match(skill, /可直接转发|直接发给对方/, 'skill must require human-ready reply drafts');
assert.match(skill, /不要编造|缺数据/, 'skill must require explicit handling of missing evidence');

assert(fs.existsSync(openaiYaml), 'developer-product-inquiry skill must include agents/openai.yaml');

const yaml = fs.readFileSync(openaiYaml, 'utf8');
assert.match(yaml, /display_name:\s*"Developer Product Inquiry"/, 'openai.yaml must expose a clear display name');
assert.match(yaml, /\$developer-product-inquiry/, 'openai.yaml default prompt must mention the skill name');

console.log('developer_product_inquiry_skill tests passed');
