# GBrain 运维手册

GBrain = `github.com/garrytan/gbrain`（Garry Tan / YC），PGLite + pgvector + ollama bge-m3（1024 维）。

- Vault: `D:\ad-ops-brain`
- DB: `C:\Users\Administrator\.gbrain\brain.pglite`
- Runtime: `D:\ad-ops-brain\.runtime\gbrain`（bun-link 克隆，有本地 customization）

## 2026-06-22 重构

8 个中文数字目录 → 英文 MECE（`skus/ decisions/ retrospectives/ playbooks/ mappings/ sources/ qa/ templates/`），根加 `RESOLVER.md / schema.md / index.md / log.md`，每个目录加 `README.md`。页面 body 仍中文，只有结构 meta 英文。

## 命令矩阵

| 命令 | 用途 | 备注 |
|------|------|------|
| `search` | keyword tsvector | 快，原始 chunk |
| `query` / `ask` | hybrid（vector+BM25+RRF+intent rewrite） | 要结论时用这个 |
| `whoknows` | 实体专家路由 | |
| `import <dir>` | 全量重导 | 跳过 content_hash 未变的页 |
| `extract --stale` / `embed --stale` | 补链接/嵌入 | |
| `doctor --json [--fast]` | 健康检查 | |
| `doctor --remediate --yes --target-score 90 --max-usd 5` | 自动修复 | |
| `stats` / `sources list` / `list -n N` | 查状态 | list 硬上限 50 行 |

## autopilot 锁坑

"GBrain Autopilot" 是 Windows 计划任务，后台跑 `dream` cycle，独占 PGLite 单写锁。

任何写操作（import/sync/直接改 DB）冲突时报 `Timed out waiting for PGLite lock`。

解法：
```powershell
Disable-ScheduledTask -TaskName 'GBrain Autopilot'
# kill cli.ts (dream|serve|autopilot) 进程
# ... 做事 ...
Enable-ScheduledTask -TaskName 'GBrain Autopilot'
```
光 kill 不 disable 会立刻被计划任务重新拉起。

## 直接改 DB

list 上限挡路时用 bun + 两个扩展，脚本要放在 runtime 目录内才能解析 node_modules：

```js
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const db = new PGlite('C:/Users/Administrator/.gbrain/brain.pglite', { extensions: { vector, pg_trgm } });
```

- `pages` 表主键 slug；FK 全 `ON DELETE CASCADE`（content_chunks/links/page_versions/tags/timeline/raw_data 自动清）。
- `import` 是增量加不是替换——rename 目录后会留旧 slug 重复页，得手动 `DELETE FROM pages WHERE slug LIKE '<old>/%'`。

## 已知坑

- `sync_freshness` 永久 fail：vault 无 origin remote，`sync` 是 no-op，时间戳不更新。重要业务引证要并跑 `rg` 并标"raw GBrain file 证据"。
- 链接图谱重建：`import` 跳过未变页时不重建 links，autopilot maintain cycle 负责。
- runtime 有本地改（AI provider recipes、RESOLVER.md），`gbrain upgrade` 会冲突——升级前要先处理本地 diff。
- 接 Claude Code 推荐 MCP：`claude mcp add gbrain -- gbrain serve`。
