# GOAL-05（终态型）：开发诉求线必须"按到期日真触发"，今天到期的复查必须出现在老板纸上

这不是任务清单，是一个终态定义。Codex 要么把系统带到这个终态、整体验收通过，要么如实报"未达成 + 卡在哪"。中间改几个文件、跑多久，是你的事。不许做一半留给下一个 goal。

## 背景（Claude 已用 live 数据亲验，不是猜）

GOAL-04 的老板纸 P1 已真过（6-01 销售数据 436,486.96 是真当日抓取，不是退回旧数据）。但 P3"三条线真闭环"是半假的：
- 开发诉求线只是把 inbox 里 24 条原始诉求**数了个数、列前 3 个**，没有按每条的 follow-up 日期判定"今天哪些到期"。
- 铁证：`data/developer_requests/2026-05-28_uan_mininotebook_cna_week_keywords.md` 里写明 follow-up「2026-06-01: 3d effect review」。今天就是 6-01，但 6-01 老板纸里 UAN/CNA 一个字都没有。这条今天最该做的复查被漏掉。
- 附带真问题（Claude 拉 live 已确认）：UAN0188 的 `cna week gifts` 5/29-5/31 三天零曝光（Impressions/Clicks/Orders 全 null），且后台 bid=0.30 与 md 记录的 0.25 不符，还多出未记录的 `cna notebook gifts`。这类"到期复查 + 落地参数对不上"正是开发诉求线该自动报红却没报的。

## 终态定义（达成=下列性质全满足，任一不满足=未达成）

**P1 开发诉求按到期日真触发，不是数数**
- 每条 developer_requests/*.md 必须能被解析出它的 follow-up 检查点日期（如「2026-06-01: 3d effect review」）。
- 跑当天老板纸时，系统按"今天 >= follow-up 日期且该检查点未关闭"判定"今天到期的复查"，自动列入当天开发诉求待办，并出现在老板纸第 2 块。
- 开发诉求线不许只显示"读取 24 条 + 前 3 个"，必须显示"今天到期 N 条 + 每条 SKU + 该做什么"。

**P2 到期复查真拉 live 数据判生死，不是标记到期就完**
- 今天到期的复查，必须真拉该 SKU 对应 lane 的 lower-layer live 数据（用现有 fetch_ad_group_rows.js 一类，连后台 9222），按 md 里写好的决策规则判 hold / bid up / flat。
- 零曝光/零点击的（如 UAN cna week gifts），按规则给"bid up 一档（仍低于市场 CPC median）"建议；有点击无单的给"hold + 查 listing/主图/价格"；有单的 flat。
- 拉到的真实 bid 与 md 记录不符时，必须报"落地参数漂移"红灯，不许默默忽略。

**P3 落地结论写回，闭环不丢**
- 每条到期复查的结论（含真实 live 指标 + 判定 + 建议）追加写回对应 developer_requests/*.md，并在 ledger/effect_review 里把该检查点状态推进（到期→已复查），下一个检查点日期挂上。
- 已复查的检查点次日不再重复报"今天到期"。

**P4 老板纸真覆盖这条线**
- 6-01（或当前业务日）老板纸的开发诉求线里，必须能看到 UAN 这批 8 个 SKU 的 cna week gifts 3 日复查到期项，含每个 SKU 的真实 live 指标摘要和判定。
- 数字可追溯到真实 live 拉取文件。

## 写死的验收靶子（绕不过去）

用 UAN mini notebooks 这条真任务验收。达成必须满足全部：
1. 系统能从 `2026-05-28_uan_mininotebook_cna_week_keywords.md` 解析出「2026-06-01: 3d effect review」这个到期点。
2. 6-01 老板纸开发诉求线**出现** UAN 8 个 SKU（UAN0188/2599/2600/3256/3257/3644/3645/3646）的 cna week gifts 复查到期项。
3. 8 个 SKU 各自拉到 5/29-5/31 的真实 lower-layer 数据（imp/clicks/cpc/orders/acos），不是快照、不是合成。
4. 对零曝光 SKU 给出 bid up 一档（≤0.32，低于市场 median 0.37）的建议；对 bid 漂移（0.30 vs 记录 0.25）报红。
5. 复查结论写回 md，检查点状态推进，下次不重复报到期。

## 红线（违反任一=未达成）

1. 禁止用快照/旧数据/合成数据冒充 live 复查——必须连后台真拉 5/29-5/31。
2. 禁止"标记到期就算复查"——必须真拉数据、真判生死。
3. 禁止开发诉求线继续只数数、列前 3 个。
4. 禁止占位符不替换、禁止把验收报告当老板纸内容。
5. 只认 diff + 真实 live 拉取文件 + 真实 SKU 指标举证，不认"我设计了/我跑通了管子"。
6. 不许新增模块/链路，只在现有件（developer_requests 解析 / external_inbox / effect_review / boss-paper）上接。
7. 做不完如实标"未达成 + 卡在哪 + 下一步"，不许假装做完或留给下一个 goal。

## 交付物（只认这个）

- diff + 6-01 老板纸全文（开发诉求线必须含 UAN 到期复查）。
- UAN 8 个 SKU 的真实 live 拉取文件路径 + 每个 SKU 的 imp/clicks/cpc/orders/acos 真实数字。
- 写回后的 `2026-05-28_uan_mininotebook_cna_week_keywords.md` 复查段。
- 一句话：开发诉求线现在是不是"今天谁到期就自动触发谁、真拉数据判生死、写回闭环"，证据是什么。

— Claude（规划），交 Codex 实施
