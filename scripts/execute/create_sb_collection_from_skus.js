#!/usr/bin/env node
// Build a complete SB product-collection (keyword) campaign from SKUs alone.
//
// Given >=3 SKUs of one brand, this resolves each SKU's account/ASIN, mines the
// historical converting search terms across all their ad groups (incl. paused),
// ranks the top-N by orders, prices every keyword at the click-weighted average
// CPC, reuses the brand's already-approved SB logo (so the ad does not land
// INCOMPLETE), builds the campaign, and reads the creative back to confirm.
//
// Usage:
//   node scripts/execute/create_sb_collection_from_skus.js --skus=HL4017,HL4004,HL2535 [--execute]
//   Options: --budget=10 --top=10 --match-type=BROAD --max-acos=0.3
//            --headline="Textured Pet Training Mats" --campaign-name="..."
//            --site-id=4 --out=path.json
//
// Defaults: dry-run (no --execute), top=10, match=BROAD, budget=10,
//           headline=AUTO (Amazon-generated, avoids non-compliant custom copy).

const { runSbCollectionCreateFlow } = require('../../src/sb_collection_create_flow');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[key] = argv[i + 1];
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = process.argv.includes('--execute') || args.execute === true || args.execute === 'true';
  if (args.maxAcos != null) args.maxAcos = Number(args.maxAcos);
  const { out, outFile } = await runSbCollectionCreateFlow({ args, execute, out: args.out });
  console.log(JSON.stringify({
    ok: out.ok,
    mode: out.dryRun ? 'dry-run' : 'execute',
    outFile,
    skus: out.skus,
    bid: out.plan?.plan?.defaultBid ?? null,
    keywordCount: out.plan?.plan?.keywords?.length ?? 0,
    campaignName: out.plan?.plan?.campaignName ?? null,
    createMeta: out.execution?.createMeta ?? null,
    readbackLogo: out.execution?.readback?.brandLogoAssetID ?? null,
    skippedReason: out.execution?.skipped ? out.execution.reason : null,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
