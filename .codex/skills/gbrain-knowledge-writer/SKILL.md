---
name: gbrain-knowledge-writer
description: Use when the user asks Codex to write, remember, save, deposit, sync, or update durable ad-ops knowledge into GBrain, D:\ad-ops-brain, Obsidian, or the local knowledge base. Also use when closing a SKU, advertising, developer-request, listing, or review task that produced a durable decision, lesson, boundary, resolver mapping, or reusable playbook worth capturing.
---

# GBrain Knowledge Writer

## Purpose

Write only durable business knowledge into `D:\ad-ops-brain`: SKU conclusions, dated decisions, effect reviews, daily lessons, playbooks, resolver mappings, and source digests. Do not save every Codex task transcript.

## Chinese Writing Rule

All user-visible pages in `D:\ad-ops-brain` must be written in Chinese.

Keep only business-conventional terms and abbreviations such as SKU, ASIN, ACOS, CVR, CPC, FBA, listing, Buy Box, SP, SB, and SBV. Translate other operational jargon:

- `live read` -> `实时读取`
- `readback` -> `读回验证`
- `lane` -> `流量`
- `campaign` -> `广告活动`
- `ad group` -> `广告组`
- `keyword` -> `关键词`
- `target` -> `投放目标`
- `ProductAd` -> `商品广告`
- `playbook` -> `标准打法`
- `dry-run` -> `预演`
- `execution summary` -> `执行摘要`

Do not write mixed phrases such as `sellerinventory live read`, `manual lane`, `ASIN target`, or `campaign / ad group / keyword / target` in visible page bodies. Use natural Chinese wording instead.

## Write Gate

Write immediately when the user explicitly asks to save to GBrain or the knowledge base.

If the user did not explicitly ask, only propose writing when the task produced one of these:

- a new SKU operating conclusion
- a dated advertising or listing decision with rationale
- an effect review result
- a repeated mistake, boundary, or rule
- a SKU / ASIN / ad campaign / ad group mapping that affects routing
- a source digest from existing learning or review artifacts

Do not write:

- raw API responses, full reports, full tables, cookies, JWTs, CSRF values, Inventory-Token, API keys, pasted secrets, or command logs
- temporary debugging notes with no reuse value
- current live metrics without date, source, and stale boundary

## Route

Use `references/page-routing.md` for the directory decision. Default vault path is `D:\ad-ops-brain`.

Prefer updating an existing SKU page when the current trusted conclusion changes. Prefer creating a dated decision or review page when the knowledge is an event.

## Required Chinese Body

Every saved page or section body must use the Chinese template in `references/chinese-template.md`.

When evidence is not from current live evidence, say so explicitly. Never present stale memory as current state.

## Workflow

1. Classify the note type and target page.
2. Check for an existing relevant page with `rg` before creating a duplicate.
3. Redact or refuse secrets and raw full snapshots.
4. Write concise Chinese Markdown.
5. Re-import the vault using the active vault runner path from `references/page-routing.md`.

6. Verify with a targeted search:

Run a targeted `gbrain search` with the vault runner path from `references/page-routing.md`.

## Script

For a new page, use `scripts/write-gbrain-note.ps1`. For edits to an existing page, use `apply_patch` so the change is reviewable.

Example:

```powershell
$body = @"
<paste the Chinese template body here>
"@

powershell -NoProfile -ExecutionPolicy Bypass -File D:\ad-ops-workbench\.codex\skills\gbrain-knowledge-writer\scripts\write-gbrain-note.ps1 `
  -Type decision `
  -Title "LUO0914 low CPC test" `
  -Sku "LUO0914" `
  -Date "2026-06-01" `
  -Body $body `
  -Import
```

## Closure

After writing, tell the user:

- which file was created or updated
- whether import succeeded
- one search query that confirms retrievability
