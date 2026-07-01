const path = require('path');

const {
  buildPlanFromArgs,
  parseArgs,
  runSbvCreateFlow,
} = require('../../src/sbv_create_flow');

const ROOT = path.join(__dirname, '..', '..');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = process.argv.includes('--execute');
  const plan = buildPlanFromArgs(args);
  const date = args.date || new Date().toISOString().slice(0, 10);
  const out = args.out || path.join(ROOT, 'data', 'actions', `sbv_create_${plan.sku || 'unknown'}_${date}.json`);
  const result = await runSbvCreateFlow({
    args,
    plan,
    execute,
    date,
    startYmd: args.startDate || args.startYmd || date,
    endYmd: args.endDate || args.endYmd || date,
    out,
  });
  const report = result.out;
  console.log(JSON.stringify({
    out: result.outFile,
    dryRun: report.dryRun,
    ok: report.ok,
    brand: report.brandEvidence ? {
      brandEntityId: report.brandEvidence.brandEntityId,
      brandRegistryName: report.brandEvidence.brandRegistryName,
      source: report.brandEvidence.source,
      error: report.brandEvidence.error,
    } : null,
    video: report.videoEvidence ? {
      assetId: report.videoEvidence.matchedAsset?.assetId || '',
      assetName: report.videoEvidence.matchedAsset?.name || '',
      status: report.videoEvidence.matchedAsset?.status || '',
      associatedAsins: report.videoEvidence.matchedAsset?.associatedAsins || [],
      error: report.videoEvidence.error,
    } : null,
    filtering: report.plan?.filtering || null,
    execution: {
      skipped: report.execution?.skipped,
      reason: report.execution?.reason,
      createOk: report.execution?.createOk,
      campaignId: report.execution?.createMeta?.campaignId || '',
      adGroupId: report.execution?.createMeta?.adGroupId || '',
      landedRows: report.execution?.readback?.landedRows?.length || 0,
      missingAfter: report.execution?.readback?.missingAfter || [],
      allLanded: report.execution?.readback?.allLanded || false,
      responseCode: report.execution?.response?.json?.code ?? null,
      responseMsg: report.execution?.response?.json?.msg || '',
    },
  }, null, 2));
  if (execute && !report.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
