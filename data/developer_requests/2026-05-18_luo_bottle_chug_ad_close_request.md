# 2026-05-18 LUO Bottle Chug Ad Close Request

## Source

- Forwarded intent: developer asked to optimize LUO0914 high-spend ads and close low/no-sales ads or SB keywords for LUO1012, LUO1051, and LUO1006.
- Source note: forwarded screenshots from the operator, not direct WeCom/WeChat access.
- Local review date: 2026-05-18.
- Backend ad data date range: 2026-04-18 to 2026-05-17.

## Product Diagnosis

- Product group: bottle chug / baby shower game products.
- Demand window: tagged as summer product, 3-10 month window, with baby shower / gender reveal / party-game demand.
- Current request is mainly waste control, not product launch expansion.
- The right action is to close or reduce non-converting SB / broad traffic while keeping proven SP paths that still produce orders.

## Evidence

- LUO0914:
  - Product target SP `asin_bottle chug baby shower_luo0914`: 30d spend 60.78, orders 5, sales 111.95, ACOS 54.29%; recent 7d spend only 0.75, 0 orders.
  - Keyword SP `kw_bottle chug_luo0914`: 30d spend 3.01, orders 1, ACOS 13.69%.
  - SB rows spent 8.46 total with 0 orders.
- LUO1012:
  - Converting SP rows exist: keyword SP 30d spend 14.54, orders 4, ACOS 15.81%; auto SP 30d spend 10.80, orders 4, ACOS 11.74%.
  - Weak/no-sales rows include SB `sbkw_bottle chug_luo1051 luo1012 luo1006` spend 18.51 / 0 orders, SBV rows spend 10.45 and 6.24 / 0 orders, SP product target spend 5.70 / 0 orders.
- LUO1051:
  - Converting rows exist: SBV keyword spend 8.37, orders 2, ACOS 18.20%; SP keyword spend 8.11, orders 2, ACOS 17.64%; auto SP spend 7.55, orders 2, ACOS 16.42%.
  - Weak/no-sales rows include shared SB `sbkw_bottle chug_luo1051 luo1012 luo1006` spend 18.51 / 0 orders and SP product target spend 3.63 / 0 orders.
- LUO1006:
  - Strong SP rows exist and should not be globally closed: keyword SP 30d spend 37.33, orders 6, ACOS 27.06%; asin SP spend 26.13, orders 4, ACOS 28.41%; exact keyword spend 4.63, orders 3, ACOS 6.81%.
  - Weak/no-sales rows include shared SB `sbkw_bottle chug_luo1051 luo1012 luo1006` spend 18.51 / 0 orders and broad SB `sb_bottle chug_luo0914 luo1012 luo1006` spend 1.30 / 0 orders.

## Decision

- Additional developer screenshots are not needed for the close/optimize judgement.
- Do not close whole SKUs.
- Candidate closure/control:
  - Close shared SB `sbkw_bottle chug_luo1051 luo1012 luo1006`.
  - Close or pause no-sales SB/SBV rows marked in the screenshots.
  - Control LUO0914 high-ACOS product target path; keep low-cost keyword SP if it stays efficient.
  - For LUO1006, only close weak SB keyword/target rows; keep proven SP campaigns.
- Status: executed on 2026-05-18 and backend landing rechecked.

## Execution

- Execution report: `data/snapshots/devreq_luo_bottle_chug_execution_2026-05-18.json`.
- Result: 37 actions submitted, 37 API successes, 0 failed.
- Paused:
  - 25 SB/SBV keyword rows across `sbkw_bottle chug_luo1051 luo1012 luo1006`, `sb_bottle chug_luo0914 luo1012 luo1006`, `sbvkw_bottle chug_luo1012`, and `sbvkw_bottle chug_luo0914`.
  - 1 SBV product target row in `sbvasin_bottle chug_luo1006 sbv-pt 定位测试`.
  - 5 SP product target rows in `asin_bottle chug_luo1051`.
  - 5 SP product target rows in `asin_bottle chug_luo1012`.
- Bid control:
  - LUO0914 SP product target `asinExpandedFrom=B0F3N9XFM5` bid lowered from 0.16 to 0.11.
- Preserved:
  - LUO1006 converting SP keyword / asin rows were not closed.
  - LUO1012 and LUO1051 converting SP keyword / auto rows were not closed.
  - LUO0914 low-cost converting SP keyword row was not closed.
- Landing verification:
  - The four touched SB keyword groups and LUO1006 SB target group returned `targetRowCount=0` after execution, meaning no enabled rows remained in the current active query.
  - LUO1051 SP product target rows: 5 rows, 0 enabled, 5 paused.
  - LUO1012 SP product target rows: 5 rows, 0 enabled, 5 paused.
  - LUO0914 high-ACOS SP target row remained enabled with bid `0.11`.

## Follow-Up

- After closure execution: same-day landing check for paused state.
- 2026-05-19: check whether spend drops without losing orders from proven SP paths.
- 2026-05-21: review whether remaining SP traffic still converts and whether LUO0914 ACOS improves.

## Operator Reply Draft

这几张图够了，不用再让她补广告截图。这个系列我看下来不是整组都不能推，而是 SB / SBV 里有几组花了钱没有订单，适合先关掉控费。

LUO1012 和 LUO1051 不是全关，SP 里面还有能出单的关键词/自动广告，先保留；截图里标出来的无销售 SB / SBV 和无销售定位可以关。LUO1006 也不能按整个 SKU 关闭，它的 SP 关键词和 asin 路径最近还有订单，ACOS 也能接受，只关共享 SB 里没有订单的那一层。LUO0914 主要是 asin 定位 ACOS 偏高，先把无单 SB 控掉，产品定位这边降消耗/收紧，保留低成本能转化的关键词路径。

已经处理完了。这组不是整 SKU 全关，我按“关无单 SB / SBV 和无单商品定位，保留能出单 SP”的原则做了。

LUO1012、LUO1051 的无单 SB/SBV 词组和无单商品定位已经关掉，但 SP 里面能出单的关键词/自动广告保留了；LUO1006 只关了无单的 SB/SBV 定位，SP 关键词和 asin 路径最近还有订单、ACOS 还能接受，没有动；LUO0914 的无单 SBV 已经关掉，asin 定位里还在转化但 ACOS 偏高的那条我降了 bid，没有直接关掉整个有效路径。

明天我会回看花费有没有降下来，同时看 LUO1006、LUO1012、LUO1051 的有效 SP 出单有没有被误伤。
