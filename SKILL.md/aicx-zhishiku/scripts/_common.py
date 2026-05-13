"""aicx-zhishiku 内部共享工具。"""
import os
import re
import sys
from datetime import date
from pathlib import Path

DEFAULT_CATEGORIES = ["工作", "学习", "技术", "生活", "灵感想法", "项目", "待分类"]


def get_kb_root() -> Path:
    home = Path.home()
    documents = home / "Documents"
    if not documents.exists():
        documents = home
    return documents / "aicx-zhishiku"


def detect_cloud_sync(kb_root: Path) -> str:
    path_str = str(kb_root)
    if sys.platform == "darwin":
        try:
            resolved = str(kb_root.parent.resolve())
            if "Mobile Documents/com~apple~CloudDocs" in resolved:
                return "icloud"
        except Exception:
            pass
        if "Mobile Documents" in path_str:
            return "icloud"
    if sys.platform == "win32":
        if "OneDrive" in path_str:
            return "onedrive"
        onedrive = os.environ.get("OneDrive") or os.environ.get("OneDriveConsumer")
        if onedrive and onedrive.lower() in path_str.lower():
            return "onedrive"
    return "none"


def today_str() -> str:
    return date.today().isoformat()


def slugify(title: str) -> str:
    """将标题转成文件名,保留中文,英文 kebab-case,特殊字符变 -。"""
    s = title.strip()
    s = re.sub(r"[\\/:\*\?\"<>\|]+", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    s = s.strip("-")
    if not s:
        s = "untitled"
    if len(s) > 80:
        s = s[:80].rstrip("-")
    return s


def parse_frontmatter(content: str):
    """简单 YAML frontmatter parser,不依赖 pyyaml。
    返回 (meta_dict, body)。无 frontmatter 时 meta 为空 dict。
    仅支持 key: value 和 key: [a, b, c] 两种形态。
    """
    if not content.startswith("---\n") and not content.startswith("---\r\n"):
        return {}, content
    rest = content.split("---", 2)
    if len(rest) < 3:
        return {}, content
    fm_text = rest[1].strip("\n").strip("\r")
    body = rest[2].lstrip("\n").lstrip("\r")
    meta = {}
    for line in fm_text.splitlines():
        line = line.rstrip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if inner:
                items = [x.strip().strip('"').strip("'") for x in inner.split(",")]
                meta[key] = [x for x in items if x]
            else:
                meta[key] = []
        else:
            value = value.strip('"').strip("'")
            meta[key] = value
    return meta, body


def format_frontmatter(meta: dict) -> str:
    lines = ["---"]
    for k, v in meta.items():
        if isinstance(v, list):
            inner = ", ".join(v)
            lines.append(f"{k}: [{inner}]")
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def iter_notes(kb_root: Path):
    """遍历所有笔记 md 文件(跳过 INDEX.md / README.md / .trash/ / 任意以 . 开头的目录)。
    yields (path, meta_dict, body_str)
    """
    if not kb_root.exists():
        return
    for path in kb_root.rglob("*.md"):
        name = path.name
        if name in ("INDEX.md", "README.md"):
            continue
        # 跳过以 . 开头的目录(如 .trash/)
        if any(part.startswith(".") for part in path.relative_to(kb_root).parts):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue
        meta, body = parse_frontmatter(content)
        yield path, meta, body


def rel_to_kb(path: Path, kb_root: Path) -> str:
    try:
        return str(path.relative_to(kb_root))
    except ValueError:
        return str(path)
