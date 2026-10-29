#!/usr/bin/env python3
"""Telegram 공개 채널(t.me/s/<channel>) 전체 글을 JSON으로 저장한다.

사용법:
    python3 -I scrape_tg.py coin500Bking out.json [--max-pages 200]

- 로그인 없이 공개 미리보기 페이지만 사용한다.
- 페이지는 ?before=<post_id> 로 과거로 넘어간다.
- 각 글의 id, 날짜(UTC), 본문, 사진 URL, 조회수를 저장한다.
"""
import argparse
import html
import json
import re
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def strip_html(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


def parse_page(page: str):
    posts = []
    # 각 메시지 블록 단위로 자른다.
    blocks = re.split(r'(?=<div class="tgme_widget_message_wrap)', page)
    for b in blocks:
        m = re.search(r'data-post="([^"]+)/(\d+)"', b)
        if not m:
            continue
        pid = int(m.group(2))
        date = re.search(r'<time datetime="([^"]+)"', b)
        text = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', b, re.S)
        photos = re.findall(r"background-image:url\('([^']+)'\)", b)
        views = re.search(r'<span class="tgme_widget_message_views">([^<]+)</span>', b)
        posts.append(
            {
                "id": pid,
                "date": date.group(1) if date else None,
                "text": strip_html(text.group(1)) if text else "",
                "photos": photos,
                "views": views.group(1) if views else None,
            }
        )
    return posts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("channel")
    ap.add_argument("out")
    ap.add_argument("--max-pages", type=int, default=200)
    ap.add_argument("--sleep", type=float, default=1.0)
    args = ap.parse_args()

    base = f"https://t.me/s/{args.channel}"
    all_posts = {}
    before = None
    for page_no in range(args.max_pages):
        url = base if before is None else f"{base}?before={before}"
        try:
            page = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"[page {page_no}] fetch failed: {e}", file=sys.stderr)
            break
        posts = parse_page(page)
        if not posts:
            break
        new = 0
        for p in posts:
            if p["id"] not in all_posts:
                all_posts[p["id"]] = p
                new += 1
        oldest = min(p["id"] for p in posts)
        print(f"[page {page_no}] {len(posts)} posts, {new} new, oldest id {oldest}", file=sys.stderr)
        if new == 0 or oldest <= 1:
            break
        before = oldest
        time.sleep(args.sleep)

    ordered = [all_posts[k] for k in sorted(all_posts)]
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=1)
    print(f"saved {len(ordered)} posts -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
