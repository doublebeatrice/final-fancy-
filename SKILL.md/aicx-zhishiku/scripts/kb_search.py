#!/usr/bin/env python3
"""kb_search.py — 在 aicx-zhishiku 知识库内检索。

用法:
  query --keyword X [--limit 5] [--category Y] [--tag Z]

匹配规则(分数从高到低):
  1. 标题精确含 query        +10
  2. tag 命中                +6
  3. 文件名含 query          +5
  4. 正文含 query(每次 +1, 上限 5)
  5. category 命中           +2

输出 JSON:
  {
    "query": "...",
    "kb_root": "...",
    "results": [
      {"path", "rel_path", "title", "category", "tags", "score",
       "snippet", "matched_lines": [...]},
      ...
    ]
  }
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import get_kb_root, iter_notes, rel_to_kb


def make_snippet(body: str, keyword: str, ctx: int = 40) -> str:
    if not keyword:
        return body[:120]
    lower_body = body.lower()
    lower_kw = keyword.lower()
    idx = lower_body.find(lower_kw)
    if idx < 0:
        return body[:120].replace("\n", " ").strip()
    start = max(0, idx - ctx)
    end = min(len(body), idx + len(keyword) + ctx)
    snippet = body[start:end].replace("\n", " ").strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(body):
        snippet = snippet + "..."
    return snippet


def matched_lines(body: str, keyword: str, max_lines: int = 3):
    if not keyword:
        return []
    lower_kw = keyword.lower()
    out = []
    for i, line in enumerate(body.splitlines(), 1):
        if lower_kw in line.lower():
            out.append({"line": i, "text": line.strip()[:200]})
            if len(out) >= max_lines:
                break
    return out


def score_note(meta: dict, body: str, path: Path, keyword: str,
               category_filter: str | None, tag_filter: str | None):
    title = str(meta.get("title", "")).strip()
    tags = meta.get("tags", []) or []
    if isinstance(tags, str):
        tags = [tags]
    category = str(meta.get("category", "")).strip()

    if category_filter and category_filter != category:
        return 0
    if tag_filter and tag_filter not in tags:
        return 0

    score = 0
    if not keyword:
        return 1 if (category_filter or tag_filter) else 0

    kw = keyword.lower()
    if title and kw in title.lower():
        score += 10
    for t in tags:
        if kw in str(t).lower():
            score += 6
            break
    if kw in path.stem.lower():
        score += 5
    body_hits = body.lower().count(kw)
    score += min(body_hits, 5)
    if category and kw in category.lower():
        score += 2
    if meta.get("archived") in (True, "true", "True"):
        score = max(0, score - 3)
    return score


def cmd_query(args):
    kb_root = get_kb_root()
    if not kb_root.exists():
        print(json.dumps({
            "query": args.keyword,
            "kb_root": str(kb_root),
            "results": [],
            "error": "knowledge_base_not_initialized",
        }, ensure_ascii=False, indent=2))
        return

    keyword = args.keyword or ""
    results = []
    for path, meta, body in iter_notes(kb_root):
        s = score_note(meta, body, path, keyword, args.category, args.tag)
        if s <= 0:
            continue
        results.append({
            "path": str(path),
            "rel_path": rel_to_kb(path, kb_root),
            "title": str(meta.get("title", path.stem)),
            "category": str(meta.get("category", "")),
            "tags": meta.get("tags", []) or [],
            "created": str(meta.get("created", "")),
            "updated": str(meta.get("updated", "")),
            "archived": meta.get("archived") in (True, "true", "True"),
            "score": s,
            "snippet": make_snippet(body, keyword),
            "matched_lines": matched_lines(body, keyword),
        })

    results.sort(key=lambda x: (-x["score"], x["title"]))
    results = results[: args.limit]

    print(json.dumps({
        "query": keyword,
        "kb_root": str(kb_root),
        "result_count": len(results),
        "results": results,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="aicx-zhishiku 检索")
    sub = parser.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("query")
    q.add_argument("--keyword", default="", help="搜索关键词(可空,配合 --category/--tag)")
    q.add_argument("--limit", type=int, default=5)
    q.add_argument("--category", default=None)
    q.add_argument("--tag", default=None)
    q.set_defaults(func=cmd_query)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
