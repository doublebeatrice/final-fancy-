# 2026-05-18 WOO0172 / WOO0173 / WOO0174 CNA Nurse Keywords

## Source

- Forwarded intent: `WOO0174 WOO0173 WOO0172 宝子，这组产品标题已申请移除母亲节 广告可以加一下 nurse appreciation gifts / nurse graduation gifts for women / cna week gift`
- Request type: ad keyword supplement after Mother's Day title-removal request.
- Source note: forwarded screenshot/text from the operator, not direct WeCom/WeChat access.

## Product Diagnosis

- Product type: bulk mini inspirational motivational notebooks.
- Recipient / occasion fit: employee appreciation, teachers, CNA, nurses, volunteers, office staff, and graduation gifts.
- Timing:
  - National Nurses Week 2026 was May 6-12, so `nurse appreciation gifts` is now tail/evergreen rather than peak week traffic.
  - CNA Week / National Nursing Assistants Week 2026 is June 11-17, so `cna week gift(s)` is a valid preheat direction on 2026-05-18.
  - `nurse graduation gifts for women` is still plausible because the titles already include graduation gift positioning.
- Constraint: do not restore broad scale. WOO0172 has recent clicks without orders; WOO0174 has no current active ad product rows after a high-volume prior week; WOO0173 is the strongest current performer.

## Evidence

- Sellerinventory origin title:
  - WOO0172: `Zhanmai 60 Pieces Mini Notebooks Bulk ... Teachers Cna Nurses Volunteers Office Staff Graduation Gift`
  - WOO0173: `Zhanmai 120 Pieces Mini Notebooks Bulk ... Teachers Cna Nurses Volunteers Office Staff Graduation Gift`
  - WOO0174: `Zhanmai 30 Pieces Mini Notebooks Bulk ... Teachers Cna Nurses Volunteers Office Staff Graduation Gift`
- WOO0172 ad summary: 7d `459 impressions / 16 clicks / $3.37 spend / 0 orders`; 30d ACOS `26.74%`.
- WOO0173 ad summary: 7d `661 impressions / 26 clicks / $3.90 spend / 2 orders / $100.96 sales / 3.86% ACOS`; existing coverage was SP auto only.
- WOO0174 ad summary: current active ad product rows `0`; previous 7d row showed `25,594 impressions / 574 clicks / $150.44 spend / 34 orders`, so restart only as a small controlled test.
- Live backend readiness check on 2026-05-18: adv and sellerinventory sessions both ready.

## Action Taken

- Created schema: `data/snapshots/devreq_WOO0172_0174_nurse_cna_keyword_schema_2026-05-18.json`.
- Dry-run passed: 3 SKUs, 3 create actions, review `0`, skipped `0`, validation errors `0`.
- Executed 3 low-budget SP PHRASE keyword campaigns:
  - WOO0172: `devreq_kw_cna_nurse_gifts_woo0172`, campaign `260156911499624`, ad group `271724669717953`, daily budget `$2`, bid `$0.16`.
  - WOO0173: `devreq_kw_cna_nurse_gifts_woo0173`, campaign `193945103171213`, ad group `141388131694623`, daily budget `$3`, bid `$0.18`.
  - WOO0174: `devreq_kw_cna_nurse_gifts_woo0174`, campaign `29710773884375`, ad group `134084613108294`, daily budget `$2`, bid `$0.16`.
- Keywords added in each campaign:
  - `cna week gift`
  - `cna week gifts`
  - `nurse appreciation gifts`
  - `nurse graduation gifts for women`
- Execution verification: `success=3`, `failed=0`, `not_landed=0`, `unverified=0`.

## Follow-up

- 2026-05-19: landing check for impressions/clicks and whether search terms stay in CNA/nurse/graduation intent.
- 2026-05-21: early quality check; if WOO0172 or WOO0174 spends with no aligned clicks/orders, reduce or pause the new campaign.
- 2026-05-25: CNA Week preheat review; decide whether to keep small test, widen terms, or stop tail `nurse appreciation` traffic.

## Reply Draft

可以回复开发：

这组我看过了，标题里母亲节去掉之后，产品本身还是能承接 CNA / nurse / graduation gift 的，尤其标题原本就有 Cna Nurses 和 Graduation Gift，不是硬蹭词。

广告我今天没有直接大幅加预算，只给 WOO0172、WOO0173、WOO0174 各补了一个小预算的 SP 词组，先跑 `cna week gift / cna week gifts / nurse appreciation gifts / nurse graduation gifts for women` 这几个方向。WOO0173 近 7 天转化最好，所以预算稍微高一点；WOO0172 和 WOO0174 先低价测，避免母亲节后尾流量烧费。

我明天先看是否正常起曝光和搜索词是否贴合，3 天后看点击质量和有没有订单。如果 CNA 方向起来，再继续小幅扩；如果只花钱不出单，就及时收掉。
