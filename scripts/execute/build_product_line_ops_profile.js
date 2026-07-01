const { runProductLineOpsProfile } = require('../../src/product_line_ops_profile');

function getArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    sample: args.includes('--sample'),
    today: getArg(args, '--today'),
    site: getArg(args, '--site'),
    sku: getArg(args, '--sku'),
    asin: getArg(args, '--asin'),
    terms: getArg(args, '--terms') || getArg(args, '--keywords'),
    outFile: getArg(args, '--out'),
    productProfileFile: getArg(args, '--product-profile'),
    listingReport: getArg(args, '--listing-report'),
    inventoryReport: getArg(args, '--inventory-report') || getArg(args, '--sellerinventory-report'),
    adBackendReport: getArg(args, '--ad-backend-report') || getArg(args, '--ad-report'),
    amazonFrontendReport: getArg(args, '--amazon-frontend-report'),
    gbrainReport: getArg(args, '--gbrain-report'),
    keywordResearchReport: getArg(args, '--keyword-research-report'),
    keywordConversionReport: getArg(args, '--keyword-conversion-report'),
    abaReport: getArg(args, '--aba-report'),
    seasonalityReport: getArg(args, '--seasonality-report'),
    productTimeMachineReport: getArg(args, '--product-time-machine-report'),
    operatingIntelligenceReport: getArg(args, '--operating-intelligence-report'),
    sifReverseKeywordsReport: getArg(args, '--sif-reverse-keywords-report'),
    sifKeywordHistoryReport: getArg(args, '--sif-keyword-history-report'),
    sifAdXrayReport: getArg(args, '--sif-ad-xray-report'),
    sifKeywordSlotsReport: getArg(args, '--sif-keyword-slots-report'),
  };
}

function main() {
  const options = parseArgs(process.argv);
  const result = runProductLineOpsProfile(options);
  console.log(JSON.stringify({
    ok: true,
    outFile: options.outFile || '',
    capabilityId: result.profile.capabilityId,
    decisionGate: result.profile.decisionGate,
    missingEvidence: result.profile.missingEvidence,
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
  parseArgs,
};
