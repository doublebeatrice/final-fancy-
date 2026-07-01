# 企业微信表格导出 xlsx 通路

> 企业微信文档「表格」(doc.weixin.qq.com/sheet) 导出本地 xlsx 的可复用通路。

## npm 入口（两步）

1. **提取**：`npm run sheet:export -- "<url>" --out x.sheets.json --json` → `scripts/execute/export_wecom_sheet.js`，走 CDP 9222 逐表读内存 grid。
2. **构建**：`npm run sheet:build -- x.sheets.json out.xlsx` → `scripts/execute/build_xlsx_from_sheets.py`，openpyxl 落盘，复用单元格 `numberFormat.formatCode` 还原日期/百分比。

测试：`tests/wecom_sheet_export_skill.test.js`（已挂进 `npm test`）。

## 关键坑（都已在脚本里解决）

- **惰性加载**：只有「当前激活」的表在内存有数据，切走就清空 → 必须逐表激活后立刻读。
- **窗口最小化节流**：渲染器被节流不加载 → 脚本发 `Page.setWebLifecycleState=active` 解除。
- **激活方式**：靠 CDP 真实点击底部 sheet 标签(`.tab-bar-item-container`)，合成 DOM 事件无效；`scrollIntoView` 有动画，要 settle 再读坐标。
- **隐藏表**(state=2，无标签)：用 `behaviorApi.sheetApi.setSheetState({sheetId, sheetState:1})` 临时取消隐藏。必须先 monkey-patch `commitService.commitMutation` 成 no-op，保证只改本地内存、不同步到服务器。读完批量改回 state:2（带 verify+retry）。
- **设计**：一次性批量取消隐藏全部隐藏表 → 稳定标签栏下逐表读 → finally 批量还原。逐表 unhide/rehide 会 churn 标签栏导致大量失败。
- **单元格值类型**：标量、富文本`{r:[{t}]}`(拼接 .t)、含非法 XML 控制字符(openpyxl 报 IllegalCharacterError，要正则清洗)。
- 默认跳过名为「账号密码」的敏感表，不落盘明文。

## 依赖

- 项目 node_modules 的 `ws`（脚本必须在项目目录跑）
- openpyxl（系统 Python 已装）
- `npm run chrome:ready` 起 9222 调试 Chrome 并登录企业微信工作区
