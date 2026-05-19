# Codex-Created Keyword Broad-Term Cleanup - 2026-05-18

## Scope

- Source: all `data/adjustments/adjustments_*.json` successful SP `keywordTarget` create records attributed to Codex/proactive execution.
- Created keyword groups reviewed: 33.
- Risky created keyword groups found: 16.
- Cleanup executed in this pass: 71 enabled keyword rows across 15 groups.
- Prior same-thread cleanup: 8 keyword rows in `proactive_kw_mom_baby_shower_gift_basket_shq3950`.
- Total confirmed paused on 2026-05-18 from this incident: 79 keyword rows.

## Root Cause

The proactive new-product create generator treated `productProfile` fields and `createContext.keywordSeeds` as if every seed were a buyer-facing keyword. It then created SP phrase groups from the first seeds without requiring product-theme isolation or filtering naked fragments.

This allowed category/audience/occasion fragments such as `baby`, `women`, `decor`, `jewelry`, `gift basket`, `party supplies`, `apparel`, `summer`, `nurse`, `wedding`, `graduation`, and internal labels like `summer product season` to enter live campaigns.

This was an execution-quality failure, not a normal optimization miss. The correct behavior is to stop automatic keyword creation when the available terms are broad, internally labeled, or unsupported by listing/search evidence.

## Executed Cleanup

| SKU | Group | Paused terms | Spend | Clicks | Orders | Verified |
|---|---|---:|---:|---:|---:|---:|
| SHQ3949 | proactive_kw_mom_baby_shower_gift_basket_shq3949 | baby, baby shower, party supplies, decor, jewelry, gift basket, women, mom baby shower gift basket | 3.00 | 10 | 0 | 8/8 |
| SHQ3955 | proactive_kw_mom_baby_shower_gift_basket_shq3955 | baby, decor, party supplies, baby shower, women, gift basket, jewelry, mom baby shower gift basket | 1.71 | 8 | 0 | 8/8 |
| QUN5204 | proactive_kw_graduate_graduation_gift_basket_qun5204 | wedding, graduation, decor, women, graduate, gift basket, jewelry | 0.30 | 1 | 0 | 7/7 |
| MF6292 | proactive_kw_mom_summer_gift_basket_mf6292 | women, party supplies, summer, decor, mom summer gift basket | 0.30 | 1 | 0 | 5/5 |
| MF6292 | broad_summer_product_season_mf6292 | decor, gifts, summer product season gifts | 0.00 | 0 | 0 | 3/3 |
| MF6328 | broad_summer_product_season_mf6328 | summer product season gift, summer product season | 0.00 | 0 | 0 | 2/2 |
| SSU4939 | proactive_kw_men_gift_basket_ssu4939 | decor, gift basket, apparel, men gift basket | 0.00 | 0 | 0 | 4/4 |
| MF6328 | proactive_kw_mom_summer_gift_basket_mf6328 | summer, decor, women, apparel | 0.00 | 0 | 0 | 4/4 |
| TUR8821 | proactive_kw_nurse_christian_inspirational_gift_basket_tur8821 | jewelry, nurse, decor, party supplies, apparel, gift basket | 0.00 | 0 | 0 | 6/6 |
| OB4139 | proactive_kw_nurse_fiesta_gift_basket_ob4139 | nurse, gift basket, fiesta, decor, jewelry, women, party supplies | 0.00 | 0 | 0 | 7/7 |
| KZ6722 | proactive_kw_nurse_graduation_gift_basket_kz6722 | decor, nurse, graduate, jewelry, apparel, gift basket | 0.00 | 0 | 0 | 6/6 |
| YUT4464 | proactive_kw_nurse_summer_decor_yut4464 | decor, summer, nurse | 0.00 | 0 | 0 | 3/3 |
| STY6101 | proactive_kw_nurse_wedding_gift_basket_sty6101 | wedding, party supplies, apparel, nurse, gift basket | 0.00 | 0 | 0 | 5/5 |
| TH3351 | proactive_kw_women_jewelry_th3351 | decor, women | 0.00 | 0 | 0 | 2/2 |
| TH3353 | proactive_kw_women_jewelry_th3353 | decor | 0.00 | 0 | 0 | 1/1 |

Additional note: `proactive_kw_mom_baby_shower_gift_basket_shq3950` was paused earlier in the same incident response. That group had 8 paused keywords, including `baby`, with 6.21 spend, 22 clicks, and 0 orders. `STY6101` already had `baby` and `decor` paused before this bulk pass; live audit still counted them as part of the same bad-create surface.

## Evidence Files

- Log extraction audit: `data/tmp_tests/codex_created_keyword_group_broad_term_audit_2026-05-18.json`
- Live audit: `data/tmp_tests/codex_created_keyword_group_broad_term_live_audit_2026-05-18.json`
- Pause candidates: `data/tmp_tests/codex_created_keyword_group_hard_bad_pause_candidates_2026-05-18.json`
- API execution: `data/tmp_tests/codex_created_keyword_group_hard_bad_pause_execution_2026-05-18.json`
- Landing verification: `data/tmp_tests/codex_created_keyword_group_hard_bad_pause_verify_2026-05-18.json`
- Adjustment log: `data/adjustments/adjustments_2026-05-18.json`

## Rule Correction

- Added `qualifiedLaunchKeywordSeeds` filtering in `scripts/generators/generate_proactive_audit_action_schema.js`.
- If a new-product keyword create has fewer than three specific buyer-facing phrases after filtering, it now becomes `review` instead of live create.
- Added regression coverage in `tests/proactive_audit_action_schema.test.js`.
- Added the test to `npm test`.

## Operating Correction

Any future create workflow must run a created-keyword audit before it can be considered complete. If the audit finds naked generic fragments or internal labels, Codex must clean them as a bugfix and verify landing before reporting the create work as finished.
