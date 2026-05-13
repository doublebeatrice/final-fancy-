#!/usr/bin/env python3
"""kb_list.py — 列出知识库内容。

子命令:
  recent       --limit 10        最近更新的笔记
  categories                      分类树 + 每类计数 + 每类最近 3 条
  all                             全部笔记列表
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import DEFAULT_CATEGORIES, get_kb_root, iter_notes, rel_to_kb


def collect(kb_root: Path):
    items = []
    for path, meta, body in iter_notes(kb_root):
        if meta.get("archived") in (True, "true", "True"):
            continue
        items.append({
            "path": str(path),
            "rel_path": rel_to_kb(path, kb_root),
            "title": str(meta.get("title", path.stem)),
            "category": str(meta.get("category", path.parent.name)),
            "tags": meta.get("tags", []) or [],
            "created": str(meta.get("created", "")),
            "updated": str(meta.get("updated", "")),
        })
    return items


def cmd_recent(args):
    kb_root = get_kb_root()
    if not kb_root.exists():
        print(json.dumps({"kb_root": str(kb_root), "items": [],
                          "error": "knowledge_base_not_initialized"},
                          ensure_ascii=False, indent=2))
        return
    items = collect(kb_root)
    items.sort(key=lambda x: (x["updated"] or x["created"] or ""), reverse=True)
    items = items[: args.limit]
    print(json.dumps({"kb_root": str(kb_root), "count": len(items), "items": items},
                      ensure_ascii=False, indent=2))


def cmd_categories(_args):
    kb_root = get_kb_root()
    if not kb_root.exists():
        print(json.dumps({"kb_root": str(kb_root), "categories": [],
                          "error": "knowledge_base_not_initialized"},
                          ensure_ascii=False, indent=2))
        return
    items = collect(kb_root)
    buckets = {}
    for it in items:
        buckets.setdefault(it["category"] or "未分类", []).append(it)

    existing_dirs = set()
    for p in kb_root.iterdir():
        if p.is_dir() and not p.name.startswith(".") and p.name not in ("references",):
            existing_dirs.add(p.name)
    for d in existing_dirs:
        buckets.setdefault(d, [])

    result = []
    for cat in sorted(buckets.keys(), key=lambda x: (
        DEFAULT_CATEGORIES.index(x) if x in DEFAULT_CATEGORIES else 999, x
    )):
        lst = buckets[cat]
        lst.sort(key=lambda x: (x["updated"] or x["created"] or ""), reverse=True)
        result.append({
            "category": cat,
            "count": len(lst),
            "recent": [
                {"title": x["title"], "rel_path": x["rel_path"],
                 "updated": x["updated"]} for x in lst[:3]
            ],
        })
    print(json.dumps({"kb_root": str(kb_root), "categories": result},
                      ensure_ascii=False, indent=2))


def cmd_all(_args):
    kb_root = get_kb_root()
    if not kb_root.exists():
        print(json.dumps({"kb_root": str(kb_root), "items": [],
                          "error": "knowledge_base_not_initialized"},
                          ensure_ascii=False, indent=2))
        return
    items = collect(kb_root)
    items.sort(key=lambda x: (x["category"], x["title"]))
    print(json.dumps({"kb_root": str(kb_root), "count": len(items), "items": items},
                      ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="aicx-zhishiku 列出")
    sub = parser.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("recent")
    r.add_argument("--limit", type=int, default=10)
    r.set_defaults(func=cmd_recent)

    sub.add_parser("categories").set_defaults(func=cmd_categories)
    sub.add_parser("all").set_defaults(func=cmd_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
