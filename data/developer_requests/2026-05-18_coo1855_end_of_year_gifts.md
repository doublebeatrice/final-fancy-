# COO1855 Developer Request - End of Year Gifts

Date: 2026-05-18
Source: operator-forwarded developer request screenshot
SKU: COO1855
ASIN: B0D9LKYKWV

## Original Intent

Developer asked to optimize COO1855 title, listing, ST, and ad keywords around season or product theme:

- Match title and ads to season/theme.
- For graduation season, add end of year gifts, party favor, student/teacher gift terms:
  - end of year gifts
  - end of year student gifts from teacher
  - summer gifts for students
  - end of year gifts for students
- For worker/nurse/law/OT/Phlebotomy audiences, use graduation.
- For male/mixed accessories, consider Fathers Day Christian Gift and father day church sunday school VBS.
- For female accessories or floral Bible products, keep christian women gifts.

## Product Judgement

COO1855 is a 30-set rainbow star acrylic keychain plus "You're a Star" card gift set. Primary demand is teacher/student/classroom reward, end-of-school-year appreciation, graduation party favor, and light employee appreciation.

The product is not a Christian gift, Fathers Day product, Bible/floral religious item, or gendered accessory. Adding Fathers Day Christian, church, Sunday school VBS, or Christian women gift terms would be off-theme and likely introduce weak traffic.

## Evidence Checked

- Sellerinventory origin data returned product id `1842073`, title, bullets, description, and search core keywords.
- Current title: `Landical 30 Sets Rainbow Star Keychains Employee Appreciation Gifts End of Year Gifts and You're a Star Cards Inspirational for Student Teacher Classroom Award`.
- Current search core keywords already include appreciation, employee, student, coworkers, teacher, school, birthday, nurse practitioner, back to school, kindergarten, preschool, acrylic cards.
- Latest snapshot at 2026-05-18 09:49 shows price `$16.99`, profit rate `24.88%`, inventory days about `20`, 7d units `31`, 30d units `78`, fulfillable `43`, inbound `25`.
- 2026-04-18 to 2026-05-17 ad pull shows COO1855 has active SP traffic:
  - auto campaign: 30d spend `$50.09`, orders `17`, ACOS `17.90%`; 7d orders `6`, ACOS about `14.82%`.
  - phrase campaign: 30d spend `$30.88`, orders `7`, ACOS `29.43%`; 3d spend `$4.53`, orders `0`.
  - star keychain keyword campaign: 30d spend `$6.11`, orders `0`; recent 7d no spend.
  - total snapshot SP: 30d spend `$179.32`, orders `49`, ACOS `21.54%`; 3d spend `$8.36`, orders `1`, ACOS `49.21%`.
- SKU ad form summary flagged `waste_spread`; wasted terms include `volunteer appreciation gifts`, `star keychain`, and `inspirational keychains bulk`.
- Sales history endpoint parsed no reliable historical season table for this SKU, so exact historical peak timing is not confirmed.

## Decision

Best current move:

- Listing/ST: support a focused copy update around end-of-year student gifts, teacher gifts, graduation party favors, classroom awards, and summer gifts for students.
- Ads: do not immediately expand broad paid traffic because inventory is tight and 3d ad efficiency weakened. Keep the converting auto path; if listing/ST is submitted or approved, add only narrow low-bid test terms around end-of-year student/teacher and graduation party favor. Do not add Christian/Fathers Day/gendered religious terms.
- Waste control: monitor phrase and star-keychain paths before adding new spend. Existing poor fit terms should not be expanded.

## Suggested Copy

Recommended title:

`Landical 30 Sets Rainbow Star Keychains, End of Year Gifts for Students from Teacher, Graduation Party Favors, You're a Star Cards, Classroom Awards`

Recommended search core keywords:

`appreciation star rainbow keychains gifts employee inspirational bulk motivational student teacher classroom awards end of year student gifts from teacher summer gifts for students graduation party favors school prizes acrylic cards coworkers`

Live listing application submitted on 2026-05-18.

- Dry-run file: `data/snapshots/listing_copy_edit_dry_run_COO1855_2026-05-18.json`
- Execution file: `data/snapshots/listing_copy_edit_execution_COO1855_2026-05-18.json`
- Application ID: `4451268`
- Status: `submitted_pending_review`
- Backend message: `提交成功!`
- Auto repairs: none
- Origin data fetched: yes

## Follow-Up

- First check application/editor review status on 2026-05-19.
- After Amazon front-end is live, review sessions and conversion after 7 and 14 days.
- On 2026-05-19, also review whether auto campaign still holds ACOS and whether phrase campaign continues zero-order spend before adding or pausing terms.

## Operator Reply Draft

这款我看了下，COO1855 本身更像期末/毕业季的学生老师感谢礼物，核心是 rainbow star keychain + You're a Star 卡片，适合 end of year gifts、student gifts from teacher、graduation party favors、classroom awards 这些方向。

父亲节、Christian gift、church/sunday school/VBS、christian women gifts 这些我先不加，这款不是宗教/父亲节/女性圣经类产品，硬加会把流量打散。

广告现在不是完全没跑，近 30 天 SP 有出单，主要是 auto 路径比较稳；但近 3 天效率有变弱，库存也只有 20 天左右，所以我不建议直接扩大泛词广告。更适合先把标题和 ST 往期末学生礼物、毕业 party favor 方向补齐，广告侧后面只做小词包测试，不直接放大。

我这边建议标题/ST按这个方向改：
Landical 30 Sets Rainbow Star Keychains, End of Year Gifts for Students from Teacher, Graduation Party Favors, You're a Star Cards, Classroom Awards

ST补 end of year student gifts from teacher / summer gifts for students / graduation party favors / classroom awards，Christian 和父亲节相关词不放。
