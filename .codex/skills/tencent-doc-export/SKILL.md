---
name: tencent-doc-export
description: >
  Use when working in ad-ops-workbench to export the full text of a Tencent Docs
  or WeCom (企业微信) document — doc.weixin.qq.com, docs.qq.com, or any 腾讯文档/企微文档
  link. Trigger on Chinese or English requests like 导出文档, 把这个文档导出, 文档导出,
  腾讯文档导出, 企微文档导出, 在线文档抓取, 文档复制不了, 禁止复制的文档, 文档全文,
  export this doc, export Tencent doc, get the full text of a WeCom doc, or when the
  user pastes such a link and wants its text. These docs render the body to <canvas>
  and may disable copy for view-only members, so normal fetch/copy returns nothing;
  this skill reads the editor's in-memory model over CDP instead.
---

# Tencent / WeCom Doc Export

## Purpose

Export the full body text of a Tencent Docs / 企业微信 (WeCom) document to a local
Markdown file. These docs paint the body onto a `<canvas>`, so the page DOM holds no
body text, and many are set to "禁止仅浏览成员复制" which blocks select-all + copy. Both
defeat a plain WebFetch or clipboard grab.

This skill bypasses both by attaching to the project debug Chrome over the Chrome
DevTools Protocol and reading the melo editor's in-memory document box tree — the same
source the canvas is drawn from. It does not defeat any server-side access control: you
still need an account that can open the doc.

Default project root: `D:\ad-ops-workbench`.

## Prerequisites

The export reads from the project debug Chrome on port 9222, which must be logged into
the workspace that owns the doc (e.g. WeCom / 企业微信 account with access).

```powershell
npm run chrome:ready
```

If the doc is private and the browser is not signed into a workspace that can open it,
the export will produce no body — sign in first, then re-run.

## How To Run

Pass the doc URL. The script opens a tab (or reuses one already on that URL), waits for
the body to render and stabilize, extracts the text, and writes Markdown.

```powershell
npm run doc:export -- "<docUrl>"
```

The output path is printed on stdout. By default it writes to
`data\doc_exports\<docId>.md`. To choose the path, or to get structured metadata:

```powershell
npm run doc:export -- "<docUrl>" "data\doc_exports\my_name.md"
npm run doc:export -- "<docUrl>" --json
```

`--json` returns `{ outputFile, title, wordCount, charCount, copyBlocked, reusedTab, pages }`.
Add `--keep-tab` to leave the doc tab open after exporting (default closes the tab the
script opened).

### Including images / diagrams

The body text alone has no images. Most "图" in these docs (思维导图, 趋势图, 坐标图, 截图)
are vector-drawn straight into the `<canvas>` and have no downloadable URL, so the only
faithful way to keep them is a per-page screenshot. Add `--pages` (alias `--images`):

```powershell
npm run doc:export -- "<docUrl>" --pages
npm run doc:export -- "<docUrl>" --pages --scale 2 --json
```

This writes the Markdown plus a sibling folder `<output basename>_pages\page-001.png …`
(one PNG per rendered A4 page, covering text + all diagrams), and appends a
`## 页面图像` gallery to the Markdown linking each page. `--scale 2` doubles resolution
for crisper text (slower, larger files). The `pages` field in `--json` reports
`{ dir, captured, total, failures }`; a page that times out is retried once, and any
still-failing page index is listed in `failures` (re-run to fill gaps).

You can also call it directly:

```powershell
node scripts\execute\export_tencent_doc.js "<docUrl>" --pages --json
```

## Output

- A Markdown file: first line is `# <title>`, then the body with paragraph breaks
  preserved (melo `\r`/`\n` paragraph markers become newlines).
- With `--pages`: a `<basename>_pages\` folder of page PNGs and a `## 页面图像` gallery
  appended to the Markdown. This is the image-complete export.
- `wordCount` should land close to the doc's own "N 个字" counter (the small difference
  is punctuation and line breaks the counter excludes). Use this as a sanity check that
  the full body was captured, not just the visible viewport.

Return the output file path and the title/word count to the user. If they want it
reshaped (heading levels,归档到 docs/), do that as a follow-up on the exported file.

## Failure Handling

- "editor never exposed a populated box tree" / 0 words: the page did not finish
  loading, or the debug Chrome is not logged into a workspace that can open the doc.
  Run `npm run chrome:ready`, confirm the doc opens in that browser, then retry.
- Debug Chrome not on 9222: start it with `npm run chrome:ready` first.
- Do not fall back to WebFetch (returns only the title) or to select-all + copy (blocked
  by "禁止复制"); both are known dead ends for these canvas docs. The CDP box-tree read is
  the working path.

## How It Works (for maintenance)

`scripts\execute\export_tencent_doc.js`:

1. `GET /json/list` on port 9222 to find or `PUT /json/new` to open the doc tab.
2. Connects to the tab's `webSocketDebuggerUrl` and polls `Runtime.evaluate` until
   `window.pad.option.container.editor.getDocumentBox()` returns a populated tree and
   the word count is stable for 3 polls.
3. Walks the box tree (text props `text/char/content/...`, child props
   `childBoxes/children/...`), joins the leaf text, splits on `\r`/`\n` into paragraphs.
4. With `--pages`: sets a tall viewport via `Emulation.setDeviceMetricsOverride`, then
   scrolls page-by-page (A4 height ≈ 1101px) and `Page.captureScreenshot` clipped to the
   doc column. Screenshots come through CDP even though the canvas is cross-origin
   tainted. Per-page timeout + one retry handles melo's occasional slow redraw.

If Tencent renames `window.pad...editor` or `getDocumentBox`, re-probe the page globals
(`window.pad`, `pad.option.container.editor`) to find the new accessor and update
`EXTRACT_FN`. If pagination/screenshot breaks, re-check the `#scrollable` scroller and
`canvas.melo-page-main-view` selectors in `capturePages`.
