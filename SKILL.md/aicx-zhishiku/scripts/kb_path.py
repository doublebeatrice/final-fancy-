#!/usr/bin/env python3
"""kb_path.py — 跨平台知识库路径管理。

子命令:
  info               输出知识库根路径 + 是否已初始化 + 云同步状态(JSON)
  ensure             如不存在则初始化骨架(分类目录 + INDEX.md + README.md)
  init               强制(重新)初始化骨架,已存在的文件不覆盖
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import DEFAULT_CATEGORIES, detect_cloud_sync, get_kb_root, today_str


README_TEMPLATE = """# aicx-zhishiku 知识库

这是 **aicx-zhishiku** skill 自动维护的个人知识库。

- **位置**:`{root}`
- **创建日期**:{date}
- **检索方式**:在 Claude Code 里用自然语言说"我以前记过 X 吗""aicx 查 X"等

## 目录结构

| 分类 | 用途 |
|------|------|
| 工作 | 工作任务、会议、对齐、待办 |
| 学习 | 课程、读书、概念笔记 |
| 技术 | 代码、工具、API、配置、命令 |
| 生活 | 日常、健康、消费、家庭 |
| 灵感想法 | 灵感、点子、待验证的想法 |
| 项目 | 跟具体项目强绑的笔记 |
| 待分类 | 暂时归不到上面任何一类 |

## 文件格式

每条笔记是一个独立的 `.md` 文件,带 YAML frontmatter:

```markdown
---
title: 标题
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
category: 技术
---

正文...
```

## 维护

- `INDEX.md` 由 skill 自动维护,**不要手动改**
- 直接用编辑器改 `.md` 文件正文是安全的(skill 会保留 frontmatter)
- 删除的笔记进 `.trash/`,7 天后自动清理
"""


INDEX_TEMPLATE = """# aicx-zhishiku 索引

> 此文件由 skill 自动维护,请勿手动编辑。最后更新:{date}

## 全部笔记

(空)
"""


def init_skeleton(kb_root: Path, force: bool = False) -> dict:
    created = []
    existed = []

    if not kb_root.exists():
        kb_root.mkdir(parents=True)
        created.append(str(kb_root))
    else:
        existed.append(str(kb_root))

    for cat in DEFAULT_CATEGORIES:
        cat_dir = kb_root / cat
        if not cat_dir.exists():
            cat_dir.mkdir()
            created.append(str(cat_dir))

    trash_dir = kb_root / ".trash"
    if not trash_dir.exists():
        trash_dir.mkdir()

    readme = kb_root / "README.md"
    if not readme.exists() or force:
        readme.write_text(
            README_TEMPLATE.format(root=kb_root, date=today_str()),
            encoding="utf-8",
        )
        created.append(str(readme))

    index = kb_root / "INDEX.md"
    if not index.exists() or force:
        index.write_text(
            INDEX_TEMPLATE.format(date=today_str()),
            encoding="utf-8",
        )
        created.append(str(index))

    return {
        "root": str(kb_root),
        "created": created,
        "existed": existed,
        "cloud_sync": detect_cloud_sync(kb_root),
    }


def cmd_info(_args):
    kb_root = get_kb_root()
    info = {
        "root": str(kb_root),
        "exists": kb_root.exists(),
        "initialized": (kb_root / "INDEX.md").exists(),
        "cloud_sync": detect_cloud_sync(kb_root),
        "platform": sys.platform,
    }
    print(json.dumps(info, ensure_ascii=False, indent=2))


def cmd_ensure(_args):
    kb_root = get_kb_root()
    if (kb_root / "INDEX.md").exists():
        print(json.dumps({
            "root": str(kb_root),
            "status": "already_initialized",
            "cloud_sync": detect_cloud_sync(kb_root),
        }, ensure_ascii=False, indent=2))
        return
    result = init_skeleton(kb_root, force=False)
    result["status"] = "initialized"
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_init(_args):
    kb_root = get_kb_root()
    result = init_skeleton(kb_root, force=False)
    result["status"] = "ok"
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="aicx-zhishiku 路径与初始化")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info").set_defaults(func=cmd_info)
    sub.add_parser("ensure").set_defaults(func=cmd_ensure)
    sub.add_parser("init").set_defaults(func=cmd_init)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
