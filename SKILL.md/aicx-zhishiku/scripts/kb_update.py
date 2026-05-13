#!/usr/bin/env python3
"""kb_update.py — 修改/删除已有笔记。

子命令:
  append    --path X --content "..."           尾部追加段落,updated 刷新
  replace   --path X --old "..." --new "..."   全文/段落替换
  overwrite --path X --content "..." [--title Y] [--tags ...] [--category Z]
            整体重写正文(frontmatter 保留并刷新 updated)
  archive   --path X                            标记 archived=true(不删,只压低检索权重)
  delete    --path X                            移入 .trash/(7 天保留)
  trash-purge                                   清理 .trash/ 中超过 7 天的文件
"""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (
    format_frontmatter,
    get_kb_root,
    parse_frontmatter,
    rel_to_kb,
    today_str,
)


def resolve_target(path_arg: str) -> Path:
    """把 --path 解析成绝对路径,并强制必须在 KB 根目录内。
    防止 Claude 误把 KB 外的路径塞进来,意外改/删用户其他文件。
    """
    kb_root = get_kb_root().resolve()
    p = Path(path_arg)
    if p.is_absolute():
        target = p.resolve()
    else:
        target = (kb_root / path_arg).resolve()
    try:
        target.relative_to(kb_root)
    except ValueError:
        print(json.dumps({
            "status": "error",
            "reason": "path_outside_kb",
            "path": str(target),
            "kb_root": str(kb_root),
            "hint": "kb_update 只允许操作知识库内的文件",
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
    return target


def load(path: Path):
    content = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(content)
    return meta, body


def save(path: Path, meta: dict, body: str):
    meta["updated"] = today_str()
    if not body.endswith("\n"):
        body += "\n"
    path.write_text(format_frontmatter(meta) + "\n" + body, encoding="utf-8")


def cmd_append(args):
    path = resolve_target(args.path)
    if not path.exists():
        print(json.dumps({"status": "error", "reason": "not_found", "path": str(path)},
                          ensure_ascii=False))
        sys.exit(1)
    meta, body = load(path)
    addition = args.content
    if not body.endswith("\n"):
        body += "\n"
    body += f"\n## 追加 {today_str()}\n\n{addition}\n"
    save(path, meta, body)
    print(json.dumps({
        "status": "ok", "action": "append", "path": str(path),
        "rel_path": rel_to_kb(path, get_kb_root()),
    }, ensure_ascii=False, indent=2))


def cmd_replace(args):
    path = resolve_target(args.path)
    if not path.exists():
        print(json.dumps({"status": "error", "reason": "not_found", "path": str(path)},
                          ensure_ascii=False))
        sys.exit(1)
    meta, body = load(path)
    if args.old not in body:
        print(json.dumps({
            "status": "error",
            "reason": "old_text_not_found",
            "path": str(path),
            "hint": "用 kb_search 先确认正文里是否真的有 --old 那段",
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
    body = body.replace(args.old, args.new, 1)
    save(path, meta, body)
    print(json.dumps({
        "status": "ok", "action": "replace", "path": str(path),
        "rel_path": rel_to_kb(path, get_kb_root()),
    }, ensure_ascii=False, indent=2))


def cmd_overwrite(args):
    path = resolve_target(args.path)
    if not path.exists():
        print(json.dumps({"status": "error", "reason": "not_found", "path": str(path)},
                          ensure_ascii=False))
        sys.exit(1)
    meta, _ = load(path)
    if args.title:
        meta["title"] = args.title
    if args.tags is not None:
        meta["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]
    if args.category:
        meta["category"] = args.category
    save(path, meta, args.content)
    print(json.dumps({
        "status": "ok", "action": "overwrite", "path": str(path),
        "rel_path": rel_to_kb(path, get_kb_root()),
    }, ensure_ascii=False, indent=2))


def cmd_archive(args):
    path = resolve_target(args.path)
    if not path.exists():
        print(json.dumps({"status": "error", "reason": "not_found", "path": str(path)},
                          ensure_ascii=False))
        sys.exit(1)
    meta, body = load(path)
    meta["archived"] = "true"
    if args.related:
        meta["related"] = args.related
    save(path, meta, body)
    print(json.dumps({
        "status": "ok", "action": "archive", "path": str(path),
        "rel_path": rel_to_kb(path, get_kb_root()),
    }, ensure_ascii=False, indent=2))


def cmd_delete(args):
    path = resolve_target(args.path)
    if not path.exists():
        print(json.dumps({"status": "error", "reason": "not_found", "path": str(path)},
                          ensure_ascii=False))
        sys.exit(1)
    kb_root = get_kb_root()
    trash = kb_root / ".trash"
    trash.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    target = trash / f"{ts}__{path.parent.name}__{path.name}"
    shutil.move(str(path), str(target))

    index = kb_root / "INDEX.md"
    if index.exists():
        import re
        rel = args.path
        if Path(args.path).is_absolute():
            try:
                rel = str(Path(args.path).relative_to(kb_root))
            except ValueError:
                pass
        pattern = re.compile(r"^- \[[^\]]*\]\(" + re.escape(rel) + r"\)")
        lines = index.read_text(encoding="utf-8").splitlines()
        index.write_text(
            "\n".join(line for line in lines if not pattern.match(line)) + "\n",
            encoding="utf-8",
        )

    print(json.dumps({
        "status": "ok", "action": "delete", "moved_to": str(target),
        "note": "文件已移入 .trash/,7 天后可被 trash-purge 清理",
    }, ensure_ascii=False, indent=2))


def cmd_trash_purge(_args):
    kb_root = get_kb_root()
    trash = kb_root / ".trash"
    if not trash.exists():
        print(json.dumps({"status": "ok", "purged": []}, ensure_ascii=False))
        return
    threshold = time.time() - 7 * 86400
    purged = []
    for item in trash.iterdir():
        try:
            if item.stat().st_mtime < threshold:
                if item.is_file():
                    item.unlink()
                else:
                    shutil.rmtree(item)
                purged.append(str(item))
        except Exception:
            pass
    print(json.dumps({"status": "ok", "purged": purged}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="aicx-zhishiku 更新/删除")
    sub = parser.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("append")
    a.add_argument("--path", required=True)
    a.add_argument("--content", required=True)
    a.set_defaults(func=cmd_append)

    r = sub.add_parser("replace")
    r.add_argument("--path", required=True)
    r.add_argument("--old", required=True)
    r.add_argument("--new", required=True)
    r.set_defaults(func=cmd_replace)

    o = sub.add_parser("overwrite")
    o.add_argument("--path", required=True)
    o.add_argument("--content", required=True)
    o.add_argument("--title", default=None)
    o.add_argument("--tags", default=None)
    o.add_argument("--category", default=None)
    o.set_defaults(func=cmd_overwrite)

    ar = sub.add_parser("archive")
    ar.add_argument("--path", required=True)
    ar.add_argument("--related", default=None, help="新笔记路径,标记本笔记被哪条取代")
    ar.set_defaults(func=cmd_archive)

    d = sub.add_parser("delete")
    d.add_argument("--path", required=True)
    d.set_defaults(func=cmd_delete)

    sub.add_parser("trash-purge").set_defaults(func=cmd_trash_purge)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
