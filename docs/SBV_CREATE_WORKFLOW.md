# SBV Create Workflow

Use `scripts/execute/create_sbv.js` as the reusable Sponsored Brands Video create path.

## Command

Dry run:

```powershell
node scripts\execute\create_sbv.js --sku HUA0165 --asin B0C8M4Z2NL --accountId 600 --siteId 4 --budget 10 --bid 0.72 --keywords "flip flops bulk,bulk flip flops,disposable flip flops"
```

Live execute:

```powershell
node scripts\execute\create_sbv.js --execute --sku HUA0165 --asin B0C8M4Z2NL --accountId 600 --siteId 4 --budget 10 --bid 0.72 --keywords "flip flops bulk,bulk flip flops,disposable flip flops"
```

Equivalent npm entry:

```powershell
npm run ops:sbv:create -- --sku HUA0165 --asin B0C8M4Z2NL --accountId 600 --siteId 4 --budget 10 --bid 0.72 --keywords "flip flops bulk,bulk flip flops,disposable flip flops"
```

## What It Does

- Reads brand from `/sbProduct/getStore` unless `--brandEntityId` and `--brandName` are supplied.
- Reads exact ASIN-bound video from `/amazonAsset/getAssetList` unless `--videoAssetId` is supplied.
- Blocks creation when no exact ASIN video asset is found.
- Checks duplicate campaign names from `/product/adProductData`.
- Runs sensitive-word and internal-brand filters.
- Treats `/keyword/checkSensitiveWord` rows as blocked only when `flag` or `reason` is non-empty.
- Builds `/campaignSb/createCampaignBeta` payload with `buildSbvCreatePayload`.
- On `--execute`, creates the campaign and reads back SB campaign plus SB keyword rows.

## Completion Standard

Do not call an SBV create complete from API success alone.

Complete means:

- SB campaign row is visible.
- SB keyword rows are visible.
- Child keyword rows are enabled.
- Parent campaign state is enabled.
- Bid is the requested bid, or the report says it did not land.

If rows are not visible after create, report `created_pending_visibility` or the exact skipped reason from the action report.

## Common Skips

- `brand_missing`: account/site has no readable SB brand.
- `video_asset_missing_or_not_exact_asin`: no exact ASIN-bound video asset.
- `keyword_filtered_empty_or_too_few`: fewer than 3 valid keywords after filters.
- `duplicate_campaign`: same campaign name already exists.
- `payload_invalid`: required payload field missing.
