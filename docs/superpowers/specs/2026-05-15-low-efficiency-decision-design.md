# Low-Efficiency Keyword/Target Decision Design

Date: 2026-05-15

## Purpose

Low-efficiency advertising entities (SP/SB keywords and SP/SB targets) accumulate spend without orders or with high ACOS. The 后端 advTab `/keyword/findAllNew` already classifies a row as 低效 when the body filter set `lowCost=2 isHigh=2 coreMark=0 publicAdv=2` matches. Whether a row is currently 低效 is therefore not something we re-derive from raw metrics — it is whatever the seller-side server returns when we ask with that filter.

This design upgrades the operating loop so that:

1. The daily snapshot fetches 5 ad types × 4 windows (3d / 7d / 15d / 30d) = **20 low-efficiency pools**, hashing the result by entity id into one row per entity that records "in which pools did this row appear today".
2. The decision lib reads that pool-membership signal, not the full ad table, and judges the trend across the four windows.
3. The shared writer (spKeyword / spAuto / spTarget / sbKeyword / sbTarget) is unchanged — once we decide bid-down or pause, the same payload code applies.

## Trend Matrix (the rule the user gave)

| 30d | 15d | 7d | 3d | pattern                  | action       | reason                                                                  |
| --- | --- | -- | -- | ------------------------ | ------------ | ----------------------------------------------------------------------- |
| in  | in  | in | in | persistently_low         | bid / pause  | 持续低效，按 30d 指标走原 bidDownAmount；触发 hard-stop 则 pause          |
| in  | -   | -  | -  | improving_long_only      | hold         | 30d 才 ban 进池，近三窗已经回正 — 不要打回正在恢复的词                  |
| in  | in  | -  | -  | improving_recently       | hold         | 近 7 天起回正                                                           |
| in  | in  | in | -  | improving_marginally     | hold         | 仅 3d 拐头，给一个窗口确认                                              |
| -   | in  | in | in | recently_degraded        | bid down 小步 | 30d 表现 OK 证明出过价值，但近 15d 起劣化 — 出价过高 / 关键词时效失效  |
| -   | -   | in | in | late_degrading           | bid down 小步 | 近 7d 起拐坏                                                            |
| -   | -   | -  | in | noise_only_3d            | hold         | 3d 数据噪声大，单独不动                                                 |

`-` 表示该窗未出现在低效池里（即该窗"OK"）。

## Implementation Surface

### 1. Snapshot fetch (`extension/panel.js`)

- `fetchLowEfficiencyPools(kwCapture)` — runs after `enrichAdMetricWindows` in `fetchAllData`.
- For each `kind ∈ {kw, auto, manual, sbKw, sbTarget}` × `days ∈ {3, 7, 15, 30}`, calls `fetchAdMetricWindow(kwCapture, cfg, days, { lowEfficiency: true })`.
- The `lowEfficiency:true` flag patches the request body with `{ lowCost: 2, isHigh: '2', coreMark: '0', publicAdv: '2', state: '1', filterArray: { campaignState: '1' } }` — exactly the filter set the user uses in the advTab UI.
- Results are merged by entity id into one hash row with `windows = { 3?: {...metrics}, 7?: {...metrics}, 15?: {...metrics}, 30?: {...metrics} }`. Absent keys = entity OK in that window.

### 2. Snapshot persistence (`scripts/execute/export_snapshot.js`)

`STATE.lowEfficiencyRows` is exported as `snapshot.lowEfficiencyRows.{kw,auto,manual,sbKw,sbTarget}` — five arrays of pool-merged rows. The full kw/auto/manual/sb tables are unchanged.

### 3. Decision lib (`src/low_efficiency_decision.js`)

- `decideFromPoolMembership(entry, options)` — reads `entry.windows`, classifies via `classifyPoolPattern`, and returns one of `skip / hold / bid / pause`.
- `scanLowEfficiencyPools(snapshot, options)` — iterates the 5 pools and returns `{ summary, results }` for the runner.
- The original `decideLowEfficiencyAction(entity, options)` and `scanLowEfficiencyCandidates(snapshot, options)` remain for backward compatibility (current `gateRisk` guard in `ai_decision.js` still uses the single-window form, kept since `lastAdjustedAt` checks are still valid).

### 4. Decision bands (when action is needed)

- `persistently_low` reuses the original `bidDownAmount(metric, bid, 30)` ladder + hard-stop pause check.
- `recently_degraded / late_degrading / volatile_*_degrade / mixed_other` use a `smallBidStep` ladder:
  - bid ≥ $1 → cut $0.10
  - bid ≥ $0.50 → cut $0.05
  - bid ≥ $0.20 → cut $0.03
  - else → cut $0.02
  - `clampBid` snaps to $0.05 step at ≥ $0.50, $0.02 floor.
- `improving_*` and `noise_only_3d` always hold.

### 5. Cooldown gate

A 14-day cooldown (`options.cooldownDays = 14`) prevents repeating bid changes inside the most-recent operating window. This replaces the previous 30-day window as the cooldown source of truth — pools already know freshness, so the cooldown only protects against re-cutting a row we just touched, not against acting on a 30-day signal.

## Why This Spec Replaces the Earlier Single-Window One

The earlier design re-derived "low efficiency" from raw row metrics with a 30-day window guard. That had three problems:

1. The seller-side already has the authoritative classification — re-deriving it produced different sets.
2. A single window cannot distinguish recovering rows from genuinely persistent rows.
3. Date-only `updatedAt` strings parsed wrong and silently bypassed the 30-day cooldown.

This version delegates classification to the seller-side filter, multiplexes four windows, and replaces the cooldown's role from "primary signal" to "anti-thrash protection."

