const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'outputs', 'codex_sales_training_delivery_v1');

const requiredFiles = [
  '00_delivery_manifest.md',
  '01_new_user_skill/amazon-sales-starter-skill-pack.zip',
  '01_new_user_skill/sales_skill_install_card.png',
  '01_new_user_skill/sales-skill-install-card.md',
  '02_training_ppt/sales_codex_intro_and_start_v6_with_advanced_ops.pptx',
  '02_training_ppt/contact_sheet_ordered.jpg',
  '03_speaker_script/codex_sales_training_speaker_script.md',
  '04_acceptance/page-reading-acceptance.md',
  '04_acceptance/page-reading-test-prompts.md',
];

for (const rel of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing delivery file: ${rel}`);
}

const manifest = fs.readFileSync(path.join(root, '00_delivery_manifest.md'), 'utf8');
for (const phrase of ['新手 skill', '培训 PPT', '讲稿', '验收材料']) {
  assert.ok(manifest.includes(phrase), `manifest should mention ${phrase}`);
}

const script = fs.readFileSync(path.join(root, '03_speaker_script', 'codex_sales_training_speaker_script.md'), 'utf8');
for (const phrase of ['总时长', '预计时间', '讲什么', '达成结果', 'Slide 1', 'Slide 20']) {
  assert.ok(script.includes(phrase), `speaker script should include ${phrase}`);
}

assert.ok(script.includes('大部分同事不知道 Codex'), 'speaker script should address zero-awareness audience');
assert.ok(script.includes('不猜测看不见的数据'), 'speaker script should reinforce page-reading reliability');

console.log('sales training delivery package tests passed');
