#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { DOCS_DIR, OUTPUT_DIR, ensureDiscoveryDirs, readJson, safeFilePart, todayYmd } = require('../lib/common');
const { buildOperatorQuestions } = require('../lib/field_inference');

function latestFieldFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs.readdirSync(OUTPUT_DIR)
    .filter(name => /^field_inference_.*\.json$/.test(name))
    .map(name => path.join(OUTPUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

async function main() {
  ensureDiscoveryDirs();
  const date = todayYmd();
  const sections = [];
  for (const file of latestFieldFiles()) {
    const report = readJson(file, {});
    const questions = buildOperatorQuestions(report);
    if (!questions.length) continue;
    sections.push(`## ${report.route?.routeName || report.sourceId || safeFilePart(file)}\n\n${questions.map(item => `- ${item}`).join('\n')}`);
  }
  const content = [
    `# Questions For Operator ${date}`,
    '',
    'Only high-value fields that could not be self-confirmed are listed here.',
    '',
    sections.join('\n\n') || 'No high-value unresolved field questions found.',
    '',
  ].join('\n');
  const outputFile = path.join(DOCS_DIR, `questions_for_operator_${date}.md`);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, content, 'utf8');
  console.log(outputFile);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
