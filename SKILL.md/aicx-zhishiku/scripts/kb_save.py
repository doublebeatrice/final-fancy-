#!/usr/bin/env python3
"""kb_save.py — 写入新笔记 + 冲突预检 + 维护 INDEX.md。

子命令:
  check-conflict --title X --tags a,b [--category Z]
      预检索可能冲突的旧笔记,返回 candidates JSON。Claude 拿这个跟用户对齐后再决定 write 模式。

  write --title X --category Y --tags a,b --content "..." [--summary "..."] [--force]
      实际写入。--force 跳过冲突预检(Claude 已经跟用户对齐过)。
      默认会做一次 check-conflict,有 candidates 时**拒绝写入**并返回候选,
      让 Claude 把决策推给用户后再带 --force 重试或改走 kb_update.py。
"""
import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (
    DEFAULT_CATEGORIES,
    format_frontmatter,
    get_kb_root,
    iter_notes,
    rel_to_kb,
    slugify,
    today_str,
)
from kb_search import score_note  # 复用打分逻辑


CONFLICT_THRESHOLD = 8
TITLE_SIMILARITY_GATE = 0.4

VERSION_PATTERNS = [
    re.compile(r"\bv(\d+)\b", re.IGNORECASE),       # v1 / v2
    re.compile(r"第\s*(\d+)\s*[章节期版部集]"),       # 第 4 章 / 第 5 节
    re.compile(r"\bQ([1-4])\b"),                    # Q1 / Q2
    re.compile(r"#(\d+)\b"),                        # #1 / #2
    re.compile(r"\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b"),   # 2026-05-05 / 2026/5/5(优先于纯年份)
    re.compile(r"\b(20\d{2})\b"),                   # 2024 / 2025(单独年份)
    re.compile(r"\b(\d{1,2})\s*月\b"),              # 5 月 / 11 月
]


def title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def has_distinct_version(a: str, b: str) -> bool:
    """两个标题是否含有不同的版本号/期号。
    用于把 'X v1' vs 'X v2' 之类判断为不冲突。
    """
    for pat in VERSION_PATTERNS:
        a_versions = set(pat.findall(a))
        b_versions = set(pat.findall(b))
        if a_versions and b_versions and a_versions != b_versions:
            return True
    return False


def find_conflicts(kb_root: Path, title: str, tags: list, category: str,
                    content: str | None = None, limit: int = 5):
    """冲突判定(选项 B + 版本规则):
    1. 标题相似度 < TITLE_SIMILARITY_GATE → 跳过
    2. 标题里出现不同版本号/期号 → 跳过(版本/章节是\"新笔记\"信号)
    3. 通过门槛后,综合打分 >= CONFLICT_THRESHOLD 视为冲突
    """
    if not kb_root.exists():
        return []
    candidates = []
    for path, meta, body in iter_notes(kb_root):
        if meta.get("archived") in (True, "true", "True"):
            continue

        existing_title = str(meta.get("title", path.stem))
        sim = title_similarity(title, existing_title)
        if sim < TITLE_SIMILARITY_GATE:
            continue
        if has_distinct_version(title, existing_title):
            continue

        score = 0
        if title:
            score += score_note(meta, body, path, title, None, None)
        for t in tags:
            score += score_note(meta, body, path, t, None, None) // 2

        if score >= CONFLICT_THRESHOLD:
            candidates.append({
                "path": str(path),
                "rel_path": rel_to_kb(path, kb_root),
                "title": existing_title,
                "category": str(meta.get("category", "")),
                "tags": meta.get("tags", []) or [],
                "created": str(meta.get("created", "")),
                "updated": str(meta.get("updated", "")),
                "score": score,
                "title_similarity": round(sim, 2),
                "preview": body.strip().splitlines()[:5],
            })
    candidates.sort(key=lambda x: -x["score"])
    return candidates[:limit]


def parse_tags(tags_str: str) -> list:
    if not tags_str:
        return []
    return [t.strip() for t in tags_str.split(",") if t.strip()]


def unique_path(target: Path) -> Path:
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    candidate = parent / f"{stem}-{today_str()}{suffix}"
    if not candidate.exists():
        return candidate
    n = 2
    while True:
        candidate = parent / f"{stem}-{today_str()}-{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def update_index(kb_root: Path, rel_path: str, title: str, summary: str,
                  tags: list, created: str, action: str = "add"):
    """维护 INDEX.md。简单 append-or-replace 策略:
    每条笔记一行 `- [title](rel_path) — summary · #tag1 #tag2 · created`
    action=add 则追加;action=remove 则删除该 rel_path 行;action=update 则替换。
    """
    index = kb_root / "INDEX.md"
    if not index.exists():
        from kb_path import init_skeleton
        init_skeleton(kb_root, force=False)
    lines = index.read_text(encoding="utf-8").splitlines()

    tag_str = " ".join(f"#{t}" for t in tags) if tags else ""
    sep = " · " if (summary and tag_str) else ""
    summary_part = (summary or "").strip().replace("\n", " ")
    new_line = f"- [{title}]({rel_path}) — {summary_part}{sep}{tag_str} · {created}".rstrip()

    pattern = re.compile(r"^- \[[^\]]*\]\(" + re.escape(rel_path) + r"\)")
    out = []
    replaced = False
    for line in lines:
        if pattern.match(line):
            replaced = True
            if action == "remove":
                continue
            if action in ("update", "add"):
                out.append(new_line)
                continue
        out.append(line)

    if action in ("add", "update") and not replaced:
        try:
            anchor = out.index("## 全部笔记")
        except ValueError:
            out.append("## 全部笔记")
            anchor = len(out) - 1
        insert_at = anchor + 2
        while insert_at < len(out) and out[insert_at].strip() == "(空)":
            out.pop(insert_at)
        out.insert(insert_at, new_line)

    for i, line in enumerate(out):
        if line.startswith("> 此文件由 skill 自动维护"):
            out[i] = f"> 此文件由 skill 自动维护,请勿手动编辑。最后更新:{today_str()}"
            break

    index.write_text("\n".join(out) + "\n", encoding="utf-8")


def cmd_check_conflict(args):
    kb_root = get_kb_root()
    tags = parse_tags(args.tags)
    candidates = find_conflicts(
        kb_root, args.title, tags, args.category or "", args.content,
    )
    print(json.dumps({
        "kb_root": str(kb_root),
        "title": args.title,
        "tags": tags,
        "category": args.category,
        "has_conflict": len(candidates) > 0,
        "candidates": candidates,
    }, ensure_ascii=False, indent=2))


def cmd_write(args):
    kb_root = get_kb_root()
    if not kb_root.exists() or not (kb_root / "INDEX.md").exists():
        from kb_path import init_skeleton
        init_skeleton(kb_root, force=False)

    tags = parse_tags(args.tags)
    category = args.category or "待分类"
    if category not in DEFAULT_CATEGORIES:
        (kb_root / category).mkdir(parents=True, exist_ok=True)

    if not args.force:
        candidates = find_conflicts(
            kb_root, args.title, tags, category, args.content,
        )
        if candidates:
            print(json.dumps({
                "status": "conflict_detected",
                "kb_root": str(kb_root),
                "title": args.title,
                "candidates": candidates,
                "hint": "返回 Claude 跟用户对齐后,选择: (1)用 kb_update.py append/replace 改旧笔记 (2)kb_save.py write --force 强制新建",
            }, ensure_ascii=False, indent=2))
            sys.exit(2)

    fname = slugify(args.title) + ".md"
    target = unique_path(kb_root / category / fname)

    today = today_str()
    meta = {
        "title": args.title,
        "category": category,
        "tags": tags,
        "created": today,
        "updated": today,
    }
    body = args.content if args.content is not None else ""
    if not body.endswith("\n"):
        body += "\n"
    full = format_frontmatter(meta) + "\n" + body
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(full, encoding="utf-8")

    rel = rel_to_kb(target, kb_root)
    summary = (args.summary or body.strip().splitlines()[0] if body.strip() else "").strip()
    update_index(kb_root, rel, args.title, summary, tags, today, action="add")

    print(json.dumps({
        "status": "ok",
        "path": str(target),
        "rel_path": rel,
        "kb_root": str(kb_root),
        "title": args.title,
        "category": category,
        "tags": tags,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="aicx-zhishiku 写入")
    sub = parser.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check-conflict")
    c.add_argument("--title", required=True)
    c.add_argument("--tags", default="")
    c.add_argument("--category", default=None)
    c.add_argument("--content", default=None)
    c.set_defaults(func=cmd_check_conflict)

    w = sub.add_parser("write")
    w.add_argument("--title", required=True)
    w.add_argument("--category", required=True)
    w.add_argument("--tags", default="")
    w.add_argument("--content", required=True)
    w.add_argument("--summary", default=None)
    w.add_argument("--force", action="store_true",
                   help="跳过冲突预检(Claude 已与用户对齐过)")
    w.set_defaults(func=cmd_write)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
