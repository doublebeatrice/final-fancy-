# 2026-05-22 HEL0319 Teacher End of Year / CNA Week Ad Keywords

## Source

- Forwarded operator request: `开发诉求 HEL0319 宝子，这个产品广告加一下Teacher End of the Year、CNA Week Gift`
- Request type: ad keyword supplement.
- Operator note: source is the forwarded text from the operator, not direct chat history.

## Product Judgement

- SKU: HEL0319
- ASIN: B0C6TSBBDK
- Product: 30 pcs inspirational / appreciation keychains in bulk.
- Current live title evidence from the Father/CNA pool: `Huquary 30 Pcs Employee Appreciation Gift Inspirational Keychains Bulk Sometimes You Forget You're Awesome Motivational Gift for Nurse Employee Teacher Nurse Thank You Coworker Volunteers Party Favors`.
- Product fit:
  - Teacher End of Year: supported. Existing teacher-appreciation SP lane has 30d orders and the product/listing can carry teacher appreciation and end-of-school-year gifting.
  - CNA Week: supported as a cautious test. HEL0319 is in the CNA 7d sales pool and existing nurse/CNA-adjacent B2B auto traffic has converted, but explicit CNA keyword economics are costlier and should stay low-bid.

## Evidence Checked

- Backend readiness on 2026-05-22: `npm run chrome:ready` returned adv, sellerinventory, and selection ready.
- Ad data range: 2026-04-22 to 2026-05-21.
- Current SP teacher lane: `kw broad_teacher appreciation keychains bulk_hel0319`
  - 30d: 18,525 impressions / 79 clicks / $20.22 spend / 4 orders / ACOS 16.42%.
  - Existing lower-layer proof: `inspirational keychains bulk` had 4 orders and ACOS 9.11%.
- Current B2B nurse lane: `b2b auto_nurse appreciation gifts bulk_hel0319`
  - 30d: 2,070 impressions / 43 clicks / $12.87 spend / 5 orders / ACOS 9.33%.
- Current B2B broad nurse keyword lane: `b2b kw broad_nurse appreciation gifts bulk_hel0319`
  - Before append: 16 broad keywords, low/no click activity, no explicit `cna week gifts` or `cna appreciation gifts`.
- Selection evidence:
  - Keyword conversion returned `cna week gifts` and `cna appreciation gifts` only; both are `test_only`, with high/medium cost risk. Missing conversion rows for the two teacher phrases should be treated as a cost-layer gap, not a veto.
  - Keyword seasonality: all requested terms had rows; recommended use was small-step validation, with `teacher end of the year gifts` active in the 2026-05-17 to 2026-05-23 window.
  - Product Time Machine: `teacher end of the year gifts` latest search volume 1126, rising; `end of school year teacher gifts` latest search volume 479, rising; `cna week gifts` latest search volume 2454, declining; `cna appreciation gifts` latest search volume 378, declining; `nursing assistant week gifts` returned 0 and was not executed.

## Handling

- Reused existing SP keywordTarget lanes. No new campaign was created.
- No budget increase was made.
- Did not add duplicate `end of year teacher gifts` because it already existed in the B2B nurse keyword lane.
- Did not add `nursing assistant week gifts` because Product Time Machine returned no active rows/search volume.

## Execution

- Execution file: `data/snapshots/hel0319_teacher_cna_keyword_append_execution_2026-05-22.json`.
- API: `/keyword/createKeywordNew`.
- API result: success for both append batches.

Landed keyword readback:

| Direction | Campaign | Keyword | Keyword ID | Match | Bid | State | Created |
|---|---|---:|---:|---:|---:|---:|---|
| Teacher | `kw broad_teacher appreciation keychains bulk_hel0319` | `teacher end of the year gifts` | `64328655540062` | broad | 0.25 | enabled | 2026-05-22 14:40:05 |
| Teacher | `kw broad_teacher appreciation keychains bulk_hel0319` | `end of school year teacher gifts` | `33456277945490` | broad | 0.25 | enabled | 2026-05-22 14:40:05 |
| CNA | `b2b kw broad_nurse appreciation gifts bulk_hel0319` | `cna week gifts` | `87065132869744` | broad | 0.25 | enabled | 2026-05-22 14:40:07 |
| CNA | `b2b kw broad_nurse appreciation gifts bulk_hel0319` | `cna appreciation gifts` | `22082449958570` | broad | 0.25 | enabled | 2026-05-22 14:40:07 |

## Follow-Up

- Automation: heartbeat `hel0319-keyword-landing-check` active for 2026-05-23 to 2026-05-25 at 10:00 Asia/Shanghai in the current thread.
- 2026-05-23: confirm new keywords have impressions/clicks and no abnormal spend spike.
- 2026-05-25: 3d review for CTR, CPC, first orders, and whether teacher terms are still in the school-year window.
- 2026-05-29: CNA Week preheat review. Continue only if clicks are clean or first orders appear; otherwise keep the low bid or pause weak CNA terms.

### 2026-05-23 10:10 First Landing Check

- Ran `npm run chrome:ready`; adv, inventory, and selection sessions all returned ready.
- Re-fetched 2026-05-22 lower-layer rows for the two append lanes:
  - `kw broad_teacher appreciation keychains bulk_hel0319`: `data/snapshots/hel0319_teacher_kw_group_2026-05-22_day_after_2026-05-23.json`.
  - `b2b kw broad_nurse appreciation gifts bulk_hel0319`: `data/snapshots/hel0319_b2b_nurse_kw_group_2026-05-22_day_after_2026-05-23.json`.
- All four appended keywords are still visible, enabled, broad, and bid `0.25`.
- First-day activity for all four keywords is still `0 impressions / 0 clicks / $0.00 spend / 0 orders`.
- Judgement: no abnormal consumption and no early traffic yet. Keep low-bid test unchanged; wait for 2026-05-25 3d effect review before changing bid or pausing.

### 2026-05-24 10:02 Second Landing Check

- Ran `npm run chrome:ready`; adv, inventory, and selection sessions all returned ready.
- Re-fetched 2026-05-23 lower-layer rows and created-window readbacks for both append lanes:
  - `kw broad_teacher appreciation keychains bulk_hel0319`: `data/snapshots/hel0319_teacher_kw_group_2026-05-23_day_after_2026-05-24.json`; created-window readback `data/snapshots/hel0319_teacher_kw_group_created_window_2026-05-24.json`.
  - `b2b kw broad_nurse appreciation gifts bulk_hel0319`: `data/snapshots/hel0319_b2b_nurse_kw_group_2026-05-23_day_after_2026-05-24.json`; created-window readback `data/snapshots/hel0319_b2b_nurse_kw_group_created_window_2026-05-24.json`.
- Fresh readback still confirms all four appended keywords are enabled, broad, and bid `0.25`: `teacher end of the year gifts`, `end of school year teacher gifts`, `cna week gifts`, `cna appreciation gifts`.
- 2026-05-23 activity remains `0 impressions / 0 clicks / $0.00 spend / 0 orders` for the returned rows. The reporting endpoint filters some zero-activity new terms inconsistently by date window, so absence from one zero-data table is not treated as a paused/deleted signal when another fresh readback still shows enabled state.
- Judgement: no abnormal consumption and no traffic start yet. Keep the low-bid test unchanged; no bid-up, bid-down, pause, or budget change before the 2026-05-25 3d review.

## Operator Reply Draft

HEL0319 我看了下，这款本身是 30 件装感谢/激励钥匙扣，Teacher 年末礼和 CNA Week 都能承接，但 CNA 词成本信号偏高，所以我没有加预算，也没有重建广告，直接复用现有 SP 关键词组低价补词。

已落地 4 个 broad 词：`teacher end of the year gifts`、`end of school year teacher gifts`、`cna week gifts`、`cna appreciation gifts`，出价都压在 0.25。`nursing assistant week gifts` 选品侧没看到有效量，先不硬加。明天先看曝光点击有没有起来，3 天后看是否有首单和 ACOS，再决定继续放还是收。
