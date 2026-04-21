# YSWG Ad Ops Workbench

本项目是一个本地广告竞价调整工作台，不是单纯由 Claude 自动执行。当前工作流是：

1. Chrome 扩展面板使用浏览器登录态抓取库存和广告数据。
2. Node 脚本读取扩展面板中的产品画像。
3. `src/adjust_lib.js` 按规则生成竞价调整计划。
4. Codex/人工检查代码、数据和规则风险。
5. `auto_adjust.js` 在确认后通过广告后台接口执行竞价写入，并保存执行历史。

当前覆盖 SP 关键词、SP 自动投放、SP 手动定位/定位组、SB 关键词和 SB 定位。SB 不再只读，会进入可调整池、策略输出和执行分组。执行写入时 SB 使用独立接口：SB 关键词走 `/keywordSb/batchEditKeywordSbColumn`，SB 定位走 `/sbTarget/batchEditTargetSbColumn`。

## 主入口

- `auto_adjust.js`：自动化编排入口。连接 Chrome DevTools 端口，触发扩展面板抓数，调用规则生成计划，并执行竞价写入。
- `extension/panel.html`：Chrome 扩展面板入口。
- `extension/panel.js`：扩展面板主逻辑，负责库存、SP 关键词、SP 自动投放、SP 定位组、SB 关键词/SB 定位抓取、产品画像构建、计划导入展示和执行分组。
- `src/adjust_lib.js`：核心竞价分析规则和历史/日志写入路径。

运行自动调整前需要先启动 Chrome 远程调试并登录两个系统：

```powershell
Stop-Process -Name chrome -Force
Start-Process chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\Users\Administrator\AppData\Local\Google\Chrome\User Data" --variations-override-country=us --lang=en-US
```

需要打开并登录：

- `https://sellerinventory.yswg.com.cn`
- `https://adv.yswg.com.cn`

扩展面板：

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

Inventory note scripts:
```text
docs/INVENTORY_NOTE_WRITE_SNIPPETS.md
```

执行入口：

```powershell
node auto_adjust.js
```

注意：该命令会执行真实竞价写入。做数据检查时应只使用扩展面板抓数或 mock 写接口。

## 当前目录结构

```text
.
├── auto_adjust.js              # Node 自动化主入口，保留在根目录便于运行
├── package.json                # npm 脚本和依赖
├── package-lock.json
├── README.md
├── .mcp.json                   # Chrome DevTools MCP 配置
├── extension/                  # Chrome 扩展当前版本
├── src/                        # 核心业务逻辑
├── tests/                      # 自动测试
├── data/                       # 数据、快照、日志、历史记录
├── scripts/                    # 诊断、DevTools、生成类辅助脚本
├── docs/                       # 文档和整理报告
├── archive/                    # 历史版本和不确定用途文件
└── node_modules/
```

## 输出目录

核心输出现在集中在 `data/`：

- `data/adjustment_history.json`：成功执行后的竞价调整历史，冷却期判断依赖此文件。
- `data/snapshots/`：每日运行日志、计划快照、测试计划和历史 prompt。
- `data/snapshots/auto_run_YYYY-MM-DD.log`：自动运行日志。
- `data/snapshots/plan_YYYY-MM-DD.json`：自动生成的竞价计划。

扩展面板下载的浏览器文件仍会使用 Chrome 下载目录中的 `ad-ops/...` 路径；这是浏览器下载路径，不等同于仓库内 `data/`。

## 规则概览

核心规则在 `src/adjust_lib.js`，当前未在本次根目录整理中修改业务规则。

- 目标：按产品净利润率/TACoS 控制广告竞价，不是单纯压 ACOS。
- 加权窗口：3d * 4 + 7d * 3 + 30d * 1，只使用实际存在信号的窗口。
- 冷却：同一 entity 同方向 3 天内已调整则跳过。
- SB：SB 关键词和 SB 定位进入同一可调整池，动作类型需明确标注为 `sbKeyword` 或 `sbTarget`。
- 新品：90 天内或带新品标识；新品广告占比上限 11%，老品 8%。
- 零转化：30 天点击 >= 30 且有花费，降 30%；点击 >= 15 且有花费，降 15%。
- TACoS 超目标：超过 2.0/1.6/1.3 倍目标分别降 30%/20%/10%。
- TACoS 低于目标：低于 0.5 倍目标加 15%；低于 0.7 倍目标加 8%。
- 节气品：预热/爆发期达标可加 10%，尾声期禁止加价。

## 测试

```powershell
npm.cmd test
node --check auto_adjust.js
node --check src\adjust_lib.js
node --check extension\panel.js
```

`npm.cmd test` 当前运行 `tests/adjust_lib.test.js`，覆盖核心加权窗口和基础涨跌价行为。

## 文档

- `docs/ROOT_CLEANUP_REPORT.md`：本次根目录整理报告。
- `docs/ROOT_FILE_MAP.md`：根目录和迁移后文件地图。
- `docs/FIELD_DICTIONARY.md`：字段字典。

## 整理原则

- 不删除历史文件。
- 主入口保留在根目录。
- 当前扩展版本保留在 `extension/`。
- 核心规则放入 `src/`。
- 输出和数据放入 `data/`。
- 一次性脚本放入 `scripts/`。
- 历史版本放入 `archive/`。
