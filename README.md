# YSWG Ad Ops Workbench

本项目是一个本地广告运营工作台，用来抓取广告与库存数据、生成调价计划、执行真实写入、并做事后回查。

这份 README 只记录已经验证过的信息。没有完成闭环验证的能力，不在这里写成“已可用”。

## 当前已验证的能力

### 1. 数据抓取

已验证可以从当前 Chrome 登录态下抓取以下数据：

- inventory 数据
- SP keyword
- SP auto target
- SP manual target
- SB keyword
- SB target

已验证的抓取方式：

- 通过 Chrome 扩展面板发起抓取
- Node 脚本通过 DevTools 连接扩展面板，触发抓取并读取结果

### 2. 调价执行

已验证存在真实写入并带回查的链路：

- SP keyword bid 调整
- SP auto target bid 调整
- SP manual target bid 调整
- SB keyword bid 调整
- SB target bid 调整

说明：

- 执行结果不是只看接口 `code=200`
- 写入后会重新抓取新数据做回查
- 只有回查确认落地，才会记为最终成功

### 3. 七天未调整任务线

已验证七天未调整任务线已经接入主流程，并且与原有策略并存，不是替代关系。

当前已确认的工程约束：

- 七天未调整是补漏任务线，不覆盖原策略动作
- SP 七天未调整先按候选层识别，再落到真实执行层
- 冷却判断已改为候选级精确判断，不再因为某个子对象 blocked 就误伤整组
- 执行分组已细化到 `accountId + siteId + campaignId + adGroupId`，避免同账号粗粒度混批

### 4. 日志与回查

当前已验证会产出：

- 运行日志
- 调价计划快照
- 调价历史记录
- 事后回查结果

主要输出位置：

- [data/adjustment_history.json](D:/ad-ops-workbench/data/adjustment_history.json)
- [data/snapshots](D:/ad-ops-workbench/data/snapshots)

## 项目结构

```text
.
|-- auto_adjust.js        # Node 主执行入口
|-- extension/            # Chrome 扩展面板与页面桥接逻辑
|-- src/                  # 规则、历史、日志等核心库
|-- tests/                # 自动化测试
|-- data/                 # 运行历史、快照、日志
|-- docs/                 # 过程文档与验证报告
|-- scripts/              # 辅助脚本
|-- AGENT.md              # 七天未调整经验教训与后续约束
`-- README.md
```

## 关键文件

- [auto_adjust.js](D:/ad-ops-workbench/auto_adjust.js)  
  自动化主入口。负责连接 Chrome 面板、抓取数据、生成计划、执行写入、回查结果。

- [extension/panel.js](D:/ad-ops-workbench/extension/panel.js)  
  扩展面板核心逻辑。负责真实页面环境下的数据抓取和接口桥接。

- [src/adjust_lib.js](D:/ad-ops-workbench/src/adjust_lib.js)  
  规则分析、日志、历史记录等共用逻辑。

- [tests/adjust_lib.test.js](D:/ad-ops-workbench/tests/adjust_lib.test.js)  
  当前自动化测试入口。

- [AGENT.md](D:/ad-ops-workbench/AGENT.md)  
  七天未调整任务线这次沉淀出的经验教训和开发约束。

## 运行前准备

### 1. 启动 Chrome 远程调试

```powershell
Stop-Process -Name chrome -Force
Start-Process chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\Users\Administrator\AppData\Local\Google\Chrome\User Data" --variations-override-country=us --lang=en-US
```

### 2. 登录目标系统

需要在 Chrome 中登录：

- `https://sellerinventory.yswg.com.cn`
- `https://adv.yswg.com.cn`

### 3. 打开扩展面板

```text
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```

## 常用命令

### 运行测试

```powershell
npm test
```

### 语法检查

```powershell
node --check auto_adjust.js
node --check src\adjust_lib.js
node --check extension\panel.js
```

### 执行真实自动调价

```powershell
node auto_adjust.js
```

注意：

- 这条命令会执行真实广告写入
- 不适合当成只读检查命令

### 只做计划与校验，不落真实写入

```powershell
$env:DRY_RUN='1'
node auto_adjust.js
```

## 当前已验证的执行原则

### 1. 写入成功的标准

当前项目里，“成功”指的是：

1. 写接口返回成功
2. 重新抓取后的新数据确认目标值已经落地

缺一不可。

### 2. 403 的处理

已验证后台存在这种情况：

- 接口返回 `403`
- 原因是系统近期已经自动调整，当前人工/脚本不允许重复改

当前处理原则：

- 不把它当普通失败反复重试
- 归类为 `blocked_by_system_recent_adjust`
- 与一般失败分开统计

### 3. 七天未调整的处理原则

已确认的当前原则：

- 七天未调整是补漏，不是第二套主策略
- 同一对象同时命中原策略和七天未调整时，优先保留原策略动作
- 七天未调整只追加来源和原因，不重复生成同一执行任务

## 文档索引

下面这些文档记录的是已经发生过的验证和修复过程：

- [docs/EXECUTION_CHAIN_FIX_REPORT_2026-04-20.md](D:/ad-ops-workbench/docs/EXECUTION_CHAIN_FIX_REPORT_2026-04-20.md)
- [docs/FULL_REAL_RUN_REPORT_2026-04-20.md](D:/ad-ops-workbench/docs/FULL_REAL_RUN_REPORT_2026-04-20.md)
- [docs/FULL_DATA_INGESTION_PROGRESS.md](D:/ad-ops-workbench/docs/FULL_DATA_INGESTION_PROGRESS.md)
- [docs/FIELD_DICTIONARY.md](D:/ad-ops-workbench/docs/FIELD_DICTIONARY.md)

如果你是继续改七天未调整链路，先看：

- [AGENT.md](D:/ad-ops-workbench/AGENT.md)

## 当前未在 README 中宣称完成的事项

为了避免把未验证能力写成既成事实，这些内容不在 README 里当“已完成”宣传：

- 所有状态开关能力的全量端到端回归结论
- 所有广告类型在所有边界条件下的全量真实写入验证
- inventory 便签链路的全覆盖成功率
- 任何尚未做闭环回查的“看起来成功”的接口能力

这些内容如果后续补齐验证，再写入 README。

- 新建广告动作虽然已经接入面板策略主链，但当前仍应视为“需要人工复核”的动作，不在 README 中宣称为可默认全自动执行能力。

## 维护原则

更新这份 README 时，遵守两个原则：

1. 只写已经验证过的信息
2. 过程性结论、踩坑和约束，优先沉淀到文档，不埋在对话里
