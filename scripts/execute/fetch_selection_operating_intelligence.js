const {
  buildSelectionOperatingIntelligenceCapability,
  defaultOutputFile,
  parseArgs,
  runSelectionOperatingIntelligenceCapability,
} = require('../../src/selection_operating_intelligence_capability');

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    const sample = buildSelectionOperatingIntelligenceCapability({ sample: true });
    console.log(JSON.stringify({
      capabilityId: sample.capabilityId,
      script: 'ops:selection:operating-intelligence',
      outputFile: defaultOutputFile(options),
      sample,
    }, null, 2));
    return;
  }
  const { outFile, report } = runSelectionOperatingIntelligenceCapability(options);
  console.log(JSON.stringify({
    ok: report.ok === true,
    capabilityId: report.capabilityId,
    outFile,
    readyForDecisionSupport: report.readyForDecisionSupport,
    decisionQuality: report.operatingIntelligence.decisionQuality,
    recommendedOperatingUse: report.operatingIntelligence.recommendedOperatingUse,
    riskSignals: report.operatingIntelligence.riskSignals,
    missingEvidence: report.operatingIntelligence.missingEvidence,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  main,
};
