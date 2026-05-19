const fs = require('fs');
const path = require('path');
const { auditAdStructureOpportunities } = require('../../src/ad_structure_opportunity');

const ROOT = path.join(__dirname, '..', '..');
const inputFile = process.argv[2] || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');
const outputFile = process.argv[3] || path.join(ROOT, 'data', 'tasks', `ad_structure_opportunities_${new Date().toISOString().slice(0, 10)}.json`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const snapshot = readJson(inputFile);
  const report = auditAdStructureOpportunities(snapshot);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    outputFile,
    ...report.summary,
    sample: report.items.slice(0, 10),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { main };
