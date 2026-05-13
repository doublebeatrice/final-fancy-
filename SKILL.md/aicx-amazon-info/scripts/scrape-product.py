#!/usr/bin/env python3
"""
Amazon product page scraper - amazon-info skill.

Forked 2026-05-11 from ~/.claude/skills/amazon-listing-image/scripts/amazon-scrape.py.
Two copies exist on purpose: amazon-listing-image needs a stable shape for image
generation, amazon-info will evolve toward search/best-sellers/reviews. When
anti-bot rules change, update BOTH files.

Usage:
  python3 scrape-product.py <ASIN-or-URL> [--raw FILE] [--pretty]

Output (stdout JSON):
  asin, url, title, brand, price, rating, review_count, bullets, specs,
  main_image, _meta. Exit 0 on success, non-zero on failure (error JSON to stderr).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

ASIN_RE = re.compile(r"/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)", re.I)


def resolve_asin_and_url(arg: str) -> tuple[str, str]:
    arg = arg.strip()
    if re.fullmatch(r"[A-Z0-9]{10}", arg):
        return arg, f"https://www.amazon.com/dp/{arg}"
    m = ASIN_RE.search(arg)
    if not m:
        raise ValueError(f"Could not extract ASIN from: {arg}")
    asin = m.group(1).upper()
    return asin, f"https://www.amazon.com/dp/{asin}"


def fetch(url: str, timeout: int = 30, retries: int = 2) -> str:
    last_err: Exception | None = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return raw.decode("utf-8", errors="replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            if i < retries:
                time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"Failed after {retries + 1} attempts: {last_err}")


def _clean(s: str | None) -> str | None:
    if s is None:
        return None
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def _section_slice(page: str, start_id: str) -> str | None:
    m = re.search(rf'id="{re.escape(start_id)}"', page)
    if not m:
        return None
    return page[m.start() : m.start() + 40000]


def extract_title(page: str) -> str | None:
    m = re.search(r'id="productTitle"[^>]*>\s*([^<]+?)\s*<', page)
    return _clean(m.group(1)) if m else None


def extract_brand(page: str) -> str | None:
    m = re.search(r'id="bylineInfo"[^>]*>\s*([^<]+?)\s*<', page)
    v = _clean(m.group(1)) if m else None
    if v:
        v = re.sub(r"^(Visit the|Brand:)\s+", "", v)
        v = re.sub(r"\s+Store$", "", v)
    return v


def extract_bullets(page: str) -> list[str]:
    section = _section_slice(page, "feature-bullets")
    if not section:
        return []
    out = []
    for m in re.finditer(
        r'<li[^>]*>\s*<span class="a-list-item"[^>]*>\s*(.+?)\s*</span>\s*</li>',
        section,
        re.DOTALL,
    ):
        text = _clean(re.sub(r"<[^>]+>", "", m.group(1)))
        if text and len(text) > 20 and "Go to your orders" not in text:
            out.append(text)
        if len(out) >= 10:
            break
    return out


def extract_price(page: str) -> str | None:
    m = re.search(
        r'<span class="a-price\b[^"]*"[^>]*>\s*<span class="a-offscreen">\s*\$?([\d.,]+)\s*</span>',
        page,
    )
    return f"${m.group(1)}" if m else None


def extract_rating(page: str) -> str | None:
    m = re.search(r'(\d\.\d)\s+out of 5 stars', page)
    return m.group(1) if m else None


def extract_review_count(page: str) -> str | None:
    for pat in (
        r'id="acrCustomerReviewText"[^>]*>\s*([\d,]+)\s+(?:global\s+)?ratings?',
        r'>\s*([\d,]+)\s+(?:global\s+)?ratings?\s*<',
    ):
        m = re.search(pat, page)
        if m:
            return m.group(1)
    return None


def extract_specs(page: str) -> dict[str, str]:
    out: dict[str, str] = {}
    row_re = re.compile(
        r"<tr[^>]*>\s*<th[^>]*>\s*([^<]+?)\s*</th>\s*<td[^>]*>\s*(.+?)\s*</td>",
        re.DOTALL,
    )
    for k, v in row_re.findall(page):
        key = _clean(k)
        val = _clean(re.sub(r"<[^>]+>", " ", v))
        if key and val and key not in out and len(val) < 500:
            out[key] = val
    return out


def extract_main_image(page: str) -> str | None:
    m = re.search(r'"hiRes":"(https://[^"]+?\.jpg)"', page)
    if m:
        return m.group(1)
    m = re.search(r'id="landingImage"[^>]*data-old-hires="([^"]+)"', page)
    if m:
        return m.group(1)
    m = re.search(r'id="landingImage"[^>]*src="([^"]+)"', page)
    return m.group(1) if m else None


def scrape(arg: str, raw_path: str | None = None) -> dict[str, Any]:
    asin, url = resolve_asin_and_url(arg)
    t = time.time()
    page = fetch(url)
    if raw_path:
        with open(raw_path, "w", encoding="utf-8") as f:
            f.write(page)
    specs = extract_specs(page)
    return {
        "asin": asin,
        "url": url,
        "title": extract_title(page),
        "brand": extract_brand(page) or specs.get("Brand Name") or specs.get("Brand"),
        "price": extract_price(page),
        "rating": extract_rating(page),
        "review_count": extract_review_count(page),
        "bullets": extract_bullets(page),
        "specs": specs,
        "main_image": extract_main_image(page),
        "_meta": {
            "fetched_at": int(time.time()),
            "fetch_seconds": round(time.time() - t, 2),
            "html_bytes": len(page),
        },
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Scrape Amazon product page.")
    p.add_argument("target", help="ASIN (e.g. B0BWRHXYZW) or full Amazon URL")
    p.add_argument("--raw", metavar="FILE", help="Save raw HTML to this path")
    p.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = p.parse_args()

    try:
        data = scrape(args.target, raw_path=args.raw)
    except Exception as e:
        print(json.dumps({"error": str(e), "target": args.target}), file=sys.stderr)
        return 1

    if args.pretty:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
