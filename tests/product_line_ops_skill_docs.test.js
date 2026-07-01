const assert = require('assert');
const fs = require('fs');
const path = require('path');

const skillRoot = path.join(__dirname, '..', '.codex', 'skills', 'amazon-product-line-ops');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const routingPath = path.join(skillRoot, 'references', 'internal-evidence-routing.md');
const sellerSpriteWorkflow = fs.readFileSync(path.join(skillRoot, 'references', 'seller-sprite-data-workflow.md'), 'utf8');

assert.ok(fs.existsSync(routingPath), 'internal evidence routing reference should exist');
assert.ok(skill.includes('内部证据优先'), 'SKILL.md should name the internal-evidence-first default');
assert.ok(skill.includes('SIF') && skill.includes('selection') && skill.includes('GBrain'), 'SKILL.md should name internal sources');
assert.ok(!skill.includes('优先使用“产品图/链接 + 卖家精灵导出数据 + 少量人工确认”'), 'seller sprite must not remain the default analysis input');
assert.ok(sellerSpriteWorkflow.includes('卖家精灵只是 fallback'), 'seller sprite workflow should be explicitly demoted to fallback');

console.log('product_line_ops_skill_docs tests passed');
