# 2026-05-22 KUR0501 Operator Correction / New Traffic Remediation

## Correction

- Operator correction: the first handling was too narrow. The correct logic is not to raise one historical keyword bid by 0.02.
- Correct logic:
  - Historical conversion is a seed direction, not automatic bid-up.
  - Existing rows are for protection and control only.
  - New traffic must be discovered from same root, same use scene, same audience, and adjacent competitor/ASIN traffic.
  - Selection evidence is read-only; any live ad action still needs schema, dry-run, execution, and verification.

## Rollback

- Schema: `data/tasks/devreq_KUR0501_rollback_bad_bid_2026-05-22.json`.
- Dry-run: 1 SKU, 1 action, review 0, skipped 0, validation errors 0.
- Executed rollback: SP keyword `magnetic car decals`, keywordId `391719833749255`, bid 0.18 -> 0.16.
- Readback: bid 0.16, updatedAt 2026-05-22 15:37:49.
- Kept `asinSubstituteRelated` at 0.07 because it is current-click control on a 26-click / 0-order lane, not the growth answer.

## New Traffic Evidence

- Direct magnet route: `flower car magnets`, `flower magnets`, `flower fridge magnets`, `refrigerator flower magnets`.
- Scene bridge: `70s party decorations`; use only as a capped test because the SKU is a magnetic decor item, not a full party-decoration set.
- Evidence:
  - ABA 2026-04-30: `flower car magnets` search volume 2,222, estimated orders 820; low demand/high competition, so capped validation only.
  - Product Time Machine: `flower magnets` latest search volume 1,131, rising/improving.
  - Product Time Machine: `flower fridge magnets` latest search volume 323, rising/improving.
  - Keyword conversion: `70s party decorations` search volume 2,347, purchase volume 35, click-purchase ratio 6.62%; scene bridge only.
  - Front search repeatedly showed competitor titles covering car/home/door/fridge/refrigerator flower magnets.

## New Traffic Action

- Schema: `data/tasks/devreq_KUR0501_newtraffic_phrase_test_2026-05-22.json`.
- Created capped SP PHRASE test:
  - Campaign/ad group: `ai_kw phrase_flower magnets_kur0501`.
  - campaignId `195454623715979`, adGroupId `10863034573384`.
  - Daily budget 1, default bid 0.12.
  - Keywords: `flower car magnets`, `flower fridge magnets`, `refrigerator flower magnets`, `flower magnets`, `70s party decorations`.
- Dry-run: 1 SKU, 1 create action, review 0, skipped 0, validation errors 0.
- Execution: API success 1, final lookup success 1, inventory note success 1.
- Verification boundary: the create response contains the campaign, ad group, and all five phrase keywords. The reporting table `findAllNew` did not show newly-created target rows immediately after creation, likely due same-day reporting visibility lag.

## Follow-Up

- 2026-05-23: verify new campaign/keyword visibility in the reporting table and confirm spend remains capped.
- 2026-05-25: review 3-day impressions, clicks, CPC, and search-term relevance.
- 2026-05-29: 7-day decision:
  - keep/split terms only if traffic is relevant or there is order signal;
  - pause `70s party decorations` first if it draws generic party clicks without magnet relevance;
  - do not raise old keyword bids unless new evidence shows controlled conversion.

## Corrected Forwardable Reply

这次我按你的提醒重新处理了：不是单纯给历史词加价，而是先把去年的有效方向拆成新流量入口。刚才那条 `magnetic car decals` 加 0.02 我已经回滚到原来的 0.16；同时保留 auto substitute 的小幅控损。新流量这边我从花朵车贴、冰箱/门/车库磁贴、70s groovy 场景里筛了 5 个 phrase 词，已经建了一个低预算测试组，日预算 1、bid 0.12，先看 1-3 天曝光和点击质量，不会直接放大预算。3 天后我会看哪些词是真正相关流量，泛的会先收掉。

## Second Operator Correction: Multi-Prong Means Historical + New Traffic

- Operator correction: historical conversion is not only a seed, and it is not only a bid-up. Historical proven traffic also needs active handling while new traffic is tested.
- Corrected execution principle:
  - Historical/current proven row: small reversible bid support.
  - Historical winner terms trapped in broad: create capped exact lane for cleaner recovery.
  - Historical auto that has drifted: keep current control trim.
  - New adjacent traffic: keep the separate capped phrase test.

## Historical Proven Traffic Actions

- Schema: `data/tasks/devreq_KUR0501_history_multitrack_actions_2026-05-22.json`.
- Snapshot: `data/snapshots/devreq_KUR0501_history_multitrack_snapshot_2026-05-22.json`.
- Dry-run: 1 SKU, 2 actions, review 0, skipped 0, validation errors 0.
- Executed:
  - `magnetic car decals`, keywordId `391719833749255`: bid 0.16 -> 0.18.
    - Readback: bid 0.18, updatedAt 2026-05-22 15:45:41.
  - Created capped SP EXACT historical winner group:
    - Campaign/ad group: `ai_kw exact_car magnets_kur0501`.
    - campaignId `12052372755200`, adGroupId `242186513112195`.
    - Daily budget 1, default bid 0.11.
    - Exact keywords: `magnetic car decals`, `funny car magnets`, `car magnets`.
- Execution verification:
  - `execution_verify_2026-05-22.json` final counts: success 2, keyword success 1, skuCandidate success 1.
  - Inventory notes success 2.

## Full Current Action Stack

- Historical current winner support: `magnetic car decals` bid 0.18.
- Historical exact recovery: `ai_kw exact_car magnets_kur0501`, budget 1, bid 0.11, three exact terms.
- New traffic phrase discovery: `ai_kw phrase_flower magnets_kur0501`, budget 1, bid 0.12, five phrase terms.
- Auto historical drift control: `asinSubstituteRelated` remains at 0.07 after 26 clicks / 0 orders current window.

## Updated Forwardable Reply

我又补了一下，这个不是只加历史词，也不是只找新词，两个都要做。历史转化好的方向我这边保留并修复了：`magnetic car decals` 已小幅恢复竞价，同时把以前出过单的 `magnetic car decals / funny car magnets / car magnets` 单独建了一个低预算 exact 组，方便把历史有效流量和 broad 泛流量分开看。新流量也同步建了 phrase 测试组，走花朵车贴、冰箱/门磁贴、70s groovy 这些相邻场景。现在总共是历史保护 + exact 恢复 + 新流量测试 + auto 控损一起跑，1-3 天先看点击质量和是否出单，泛流量会及时收。

## Bid Strength Correction

- Operator challenged whether 0.02 / 0.11 / 0.07 can realistically generate impressions and clicks.
- Judgement:
  - `magnetic car decals` at 0.18 may still show because recent CPC is 0.158, but the headroom is thin for a recovery request.
  - new EXACT at 0.11 and PHRASE at 0.12 are likely too conservative for immediate click acquisition; target row IDs are not visible yet, so keyword-level rebid must wait until backend reporting exposes them.
  - auto substitute at 0.07 is too defensive for a historical lane that used to convert; it risks starving the lane instead of testing recovery.
- Schema: `data/tasks/devreq_KUR0501_bid_strength_actions_2026-05-22.json`.
- Snapshot: `data/snapshots/devreq_KUR0501_bid_strength_snapshot_2026-05-22.json`.
- Dry-run: 1 SKU, 2 actions, review 0, skipped 0, validation errors 0.
- Executed:
  - `magnetic car decals`, keywordId `391719833749255`: bid 0.18 -> 0.20.
    - Readback: bid 0.20, updatedAt 2026-05-22 15:49:24.
  - `asinSubstituteRelated`, targetId `376105176803937`: bid 0.07 -> 0.10.
    - Readback: bid 0.10, updatedAt 2026-05-22 15:49:25.
- Boundary:
  - New exact/phrase campaign rows were created successfully, but keyword IDs are not yet visible in `findAllNew`; do not duplicate-create. Rebid those rows once IDs are visible.

## Final Current Stack After Bid Strength Correction

- Historical current winner: `magnetic car decals` broad bid 0.20.
- Historical exact recovery: `ai_kw exact_car magnets_kur0501`, default bid 0.11 for now; needs rebid after keyword IDs show.
- New traffic phrase discovery: `ai_kw phrase_flower magnets_kur0501`, default bid 0.12 for now; needs rebid after keyword IDs show.
- Historical auto recovery/control: `asinSubstituteRelated` bid 0.10.

## Independent Follow-Up And Rebid Completion

- Operator feedback: do not rely on operator inspection; act like an independent operator.
- Independent check found the newly-created keyword IDs became visible:
  - Exact group `ai_kw exact_car magnets_kur0501`: 3 keyword rows visible.
  - Phrase group `ai_kw phrase_flower magnets_kur0501`: 5 keyword rows visible.
- First rebid schema attempt failed validation for the 8 new keyword rows because the execution snapshot did not include the new campaigns inside `productCards[].campaigns`.
- Fixed execution context by writing `data/snapshots/devreq_KUR0501_created_rows_rebid_snapshot_with_campaigns_2026-05-22.json`.
- Schema: `data/tasks/devreq_KUR0501_created_rows_rebid_actions_2026-05-22.json`.
- Dry-run after context repair: 1 SKU, 9 actions, review 0, skipped 0, validation errors 0.
- Executed:
  - Exact group 3 keywords: bid 0.11 -> 0.20.
    - Keywords: `car magnets`, `magnetic car decals`, `funny car magnets`.
    - Readback: bid 0.20, updatedAt around 2026-05-22 15:53:19.
  - Phrase group 5 keywords: bid 0.12 -> 0.20.
    - Keywords: `flower fridge magnets`, `flower magnets`, `flower car magnets`, `70s party decorations`, `refrigerator flower magnets`.
    - Readback: bid 0.20, updatedAt around 2026-05-22 15:53:20.
  - Auto substitute: bid 0.10 -> 0.12.
    - Readback: bid 0.12, updatedAt 2026-05-22 15:53:21.
- Execution result:
  - SP keyword exact group API success 3.
  - SP keyword phrase group API success 5.
  - SP auto target API success 1.
  - Final lookup success 9.
  - Inventory notes success 9.
- Created thread heartbeat automation `kur0501-bid-visibility-check` to refetch and review delivery without waiting for operator prompting.

## Current Operational State

- Existing broad historical winner:
  - `magnetic car decals` bid 0.20.
- Historical exact recovery:
  - `ai_kw exact_car magnets_kur0501`, budget 1, exact keywords all bid 0.20.
- New traffic phrase discovery:
  - `ai_kw phrase_flower magnets_kur0501`, budget 1, phrase keywords all bid 0.20.
- Historical auto recovery/control:
  - `asinSubstituteRelated` bid 0.12.
- Next independent check:
  - Verify whether these levels actually generate impressions/clicks.
  - If phrase scene term `70s party decorations` produces generic party traffic without magnet relevance, trim it first.
  - If exact historical terms still do not show, raise or inspect eligibility/budget/state rather than waiting.
