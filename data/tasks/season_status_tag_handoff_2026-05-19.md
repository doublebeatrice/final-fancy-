# 节气标签写入交接 2026-05-19

## 执行总结

- 本次只写库存标签，未改 listing，未改广告。
- 写入成功: 27/27; responseCodes={"200":27}
- 表格列表读回接口未拿到行，以 update 接口 27/27 更新成功回执为落地证据。

## 产品纠偏

- SC3420: live title is memorial/funeral remembrance, tagged ??????, not Memorial Day/??.
- TAN2986: live title is Nurse Week/CRNA, tagged ??????, not graduation.
- SAN1203 / CEE0467 / QAA4200: generic party/gift products, tagged ?? instead of forcing wedding.
- GUF3129: American flag patriotic events, tagged ??????, not generic summer.

| Tag | SKUs |
| --- | --- |
| 婚礼存疑未推 | SAN1203, CEE0467 |
| 父亲未推未改 | STA2610, STA2607, STA2604 |
| 婚礼未推免改 | LEM6585, HUA6645, LEM6577 |
| 毕业未推待改 | HEL3107 |
| 爱国未推待改 | GUF3129 |
| 护士尾期未推 | TAN2986 |
| 夏季未推免改 | YUT4458, MF6292 |
| 悼念不加免改 | SC3420 |
| 婚礼不加免改 | OCE1413, RHO1540 |
| 季节存疑未推 | QAA4200 |
| 同志已推已改 | QQ1764 |
| 夏季已推免改 | YUT4462, YUT4460 |
| 教会已推未改 | LO3817 |
| 未来已提未推 | OB4139, OB3296 |
| 实验免改未推 | GM3213, GM3210, GM3207, GM3201 |

## 证据文件

- data/tasks/season_status_tag_plan_2026-05-19.json
- data/snapshots/season_tag_origin_check_2026-05-19.json
- data/snapshots/season_status_tag_execution_2026-05-19.json
