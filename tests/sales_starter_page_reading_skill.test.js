const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const packRoot = path.join(__dirname, '..', 'outputs', 'codex_sales_skill_pack');
const skillRoot = path.join(packRoot, 'amazon-sales-starter');
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const openaiYaml = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
const playbook = fs.readFileSync(path.join(skillRoot, 'references', 'page-reading-playbook.md'), 'utf8');
const prompts = fs.readFileSync(path.join(skillRoot, 'references', 'starter-prompts.md'), 'utf8');

const rubricPath = path.join(skillRoot, 'references', 'page-recognition-rubric.md');
const acceptancePath = path.join(packRoot, 'acceptance', 'page-reading-acceptance.md');
const acceptancePromptsPath = path.join(packRoot, 'acceptance', 'page-reading-test-prompts.md');
const zipPath = path.join(packRoot, 'amazon-sales-starter-skill-pack.zip');

assert.ok(fs.existsSync(rubricPath), 'page recognition rubric should exist inside the skill');
assert.ok(fs.existsSync(acceptancePath), 'internal page-reading acceptance spec should exist outside the installable skill');
assert.ok(fs.existsSync(acceptancePromptsPath), 'internal page-reading test prompts should exist');
assert.ok(fs.existsSync(zipPath), 'installable skill zip should exist');

const rubric = fs.readFileSync(rubricPath, 'utf8');
const acceptance = fs.readFileSync(acceptancePath, 'utf8');
const acceptancePrompts = fs.readFileSync(acceptancePromptsPath, 'utf8');

for (const required of ['page-recognition-rubric.md', 'page-reading-playbook.md']) {
  assert.ok(skill.includes(required), `SKILL.md should route agents to ${required}`);
}

for (const systemName of ['广告系统', '库存系统', '产品系统', 'SIF / SAFE']) {
  assert.ok(rubric.includes(systemName), `rubric should include ${systemName}`);
}

for (const requiredSection of ['Page Fingerprints', 'Unknown Page Fallback', 'No Guessing Rules']) {
  assert.ok(rubric.includes(requiredSection), `rubric should include ${requiredSection}`);
}

for (const outputField of ['页面类型', '可见对象', '可见字段', '不确定项', '下一步']) {
  assert.ok(playbook.includes(outputField), `playbook should require output field: ${outputField}`);
}

assert.ok(prompts.includes('不要猜测看不见的数据'), 'starter prompt should explicitly forbid guessing invisible data');
assert.ok(prompts.includes('每个判断后面写依据字段'), 'starter prompt should require evidence fields after every judgment');

assert.ok(openaiYaml.includes('Amazon 销售入门技能包'), 'OpenAI UI metadata should have a readable Chinese display name');
assert.ok(openaiYaml.includes('只读当前页面'), 'OpenAI UI metadata should include a useful first default prompt');
assert.ok(!openaiYaml.includes('�'), 'OpenAI UI metadata should not contain replacement-character mojibake');

for (const caseId of ['AD-01', 'INV-01', 'PROD-01', 'SIF-01', 'UNKNOWN-01']) {
  assert.ok(acceptance.includes(caseId), `acceptance spec should include case ${caseId}`);
  assert.ok(acceptancePrompts.includes(caseId), `acceptance prompts should include case ${caseId}`);
}

for (const promptRequirement of ['复制给 Codex', '页面样本文本', '通过标准', '不要猜测看不见的数据', '当前页面看不到']) {
  assert.ok(acceptancePrompts.includes(promptRequirement), `acceptance prompts should include ${promptRequirement}`);
}

const zipAudit = JSON.parse(childProcess.execFileSync(
  'python',
  [
    '-c',
    [
      'import json, zipfile, sys',
      'path = sys.argv[1]',
      'text_ext = (".md", ".yaml", ".yml", ".json", ".txt")',
      'out = {"names": [], "texts": ""}',
      'with zipfile.ZipFile(path) as z:',
      '    out["names"] = z.namelist()',
      '    parts = []',
      '    for name in z.namelist():',
      '        if name.lower().endswith(text_ext):',
      '            parts.append(z.read(name).decode("utf-8"))',
      '    out["texts"] = "\\n".join(parts)',
      'print(json.dumps(out, ensure_ascii=True))',
    ].join('\n'),
    zipPath,
  ],
  { encoding: 'utf8' },
));

assert.ok(zipAudit.names.some((name) => name.endsWith('page-recognition-rubric.md')), 'zip should contain page-recognition-rubric.md');
assert.ok(zipAudit.texts.includes('不要猜测看不见的数据'), 'zip should contain the strict no-guessing first prompt');
assert.ok(!zipAudit.texts.includes('整理信息、风险和下一步建议'), 'zip should not contain the old loose install-card prompt');
assert.ok(!zipAudit.texts.includes('滞藏'), 'zip text should not contain the wrong term 滞藏');

assert.ok(!`${skill}\n${playbook}\n${prompts}\n${rubric}\n${acceptance}`.includes('滞藏'), 'deliverables should not contain the wrong term 滞藏');

console.log('sales starter page-reading skill tests passed');
