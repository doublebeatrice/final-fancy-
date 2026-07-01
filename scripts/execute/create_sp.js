const { runSpCreateFlow } = require('../../src/sp_create_flow');

// Fast SP create CLI. Examples:
//   node scripts/execute/create_sp.js --sku BOY1281 --mode auto --bid 0.7 --b2b --core-term "kids swim goggles"
//   node scripts/execute/create_sp.js --sku BOY1281 --mode auto --bid 0.7 --b2b --core-term "kids swim goggles" --execute
//   node scripts/execute/create_sp.js --sku X --mode keyword --bid 0.5 --core-term "swim goggles" --keywords "swim goggles for kids,kids goggles" --execute
//   node scripts/execute/create_sp.js --sku X --mode product --bid 0.4 --core-term "swim goggles" --target-asins "B0XXXX,B0YYYY" --execute
//
// Account/ASIN/site are auto-resolved from the SKU's existing campaigns; pass
// --account-id / --asin to override. Default is dry-run; add --execute to create.
// On --execute, success = backend returned 200 + campaignId/adGroupId (the same
// signal as the manual "创建成功" popup). Add --verify to also confirm every
// target/keyword row is live at the requested bid (slower, retries readback).
// Duplicate same-lane structure is blocked unless --allow-duplicate is given.

async function main() {
  const out = await runSpCreateFlow(process.argv.slice(2));
  console.log(JSON.stringify({
    artifact: out.artifact,
    dryRun: out.dryRun,
    ok: out.ok,
    elapsedSeconds: out.elapsedSeconds,
    resolved: out.resolved,
    plan: out.plan ? {
      sku: out.plan.sku,
      mode: out.plan.mode,
      b2b: out.plan.isB2b,
      bid: out.plan.bid,
      budget: out.plan.budget,
      campaignName: out.plan.campaignName,
    } : null,
    duplicateGuard: out.duplicateGuard || null,
    execution: out.execution ? {
      skipped: out.execution.skipped,
      reason: out.execution.reason,
      createOk: out.execution.createOk,
      campaignId: out.execution.createMeta?.campaignId || '',
      adGroupId: out.execution.createMeta?.adGroupId || '',
      landedCount: out.execution.readback?.landedCount ?? null,
      expectedCount: out.execution.readback?.expectedCount ?? null,
      allLanded: out.execution.readback?.allLanded ?? null,
      bidMatch: out.execution.readback?.bidMatch ?? null,
      note: out.execution.note || out.execution.message || '',
      error: out.execution.error || '',
    } : null,
  }, null, 2));
  if (!out.ok) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
