#!/usr/bin/env python3
"""scrape_tg.py 결과(JSON)에서 지표값으로 보이는 숫자와 설명 글을 뽑아 CSV로 만든다.

사용법:
    python3 -I extract_values.py data/posts.json data/values.csv [--keyword 지표]

- 본문에 --keyword(기본 "지표")가 들어간 글만 후보로 본다.
- 코인 이름(BTC, ETH, 비트, 이더 ...)과 숫자를 같이 뽑는다.
- 실제 글 형식을 본 뒤 PATTERNS 를 손본다. 지금은 넓게 잡는 초안이다.
"""
import argparse
import csv
import json
import re

COIN_ALIASES = {
    "BTC": ["btc", "비트", "비트코인", "bitcoin"],
    "ETH": ["eth", "이더", "이더리움", "ethereum"],
    "SOL": ["sol", "솔라나", "솔"],
    "XRP": ["xrp", "리플"],
    "DOGE": ["doge", "도지"],
}

# 숫자 앞뒤 문맥을 함께 저장한다. 나중에 어떤 숫자가 지표인지 사람이 고른다.
NUM_RE = re.compile(r"(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(%|점|pt|p)?")


def find_coins(text: str):
    low = text.lower()
    hits = []
    for sym, aliases in COIN_ALIASES.items():
        if any(a in low for a in aliases):
            hits.append(sym)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("posts")
    ap.add_argument("out")
    ap.add_argument("--keyword", default="지표")
    args = ap.parse_args()

    posts = json.load(open(args.posts, encoding="utf-8"))
    rows = []
    for p in posts:
        text = p.get("text") or ""
        if args.keyword not in text:
            continue
        coins = find_coins(text)
        for m in NUM_RE.finditer(text):
            raw = m.group(1).replace(",", "")
            try:
                val = float(raw)
            except ValueError:
                continue
            s, e = m.span()
            ctx = text[max(0, s - 25) : min(len(text), e + 25)].replace("\n", " ")
            rows.append(
                {
                    "post_id": p["id"],
                    "date": p["date"],
                    "coins": "|".join(coins),
                    "value": val,
                    "unit": m.group(2) or "",
                    "context": ctx,
                    "has_photo": bool(p.get("photos")),
                }
            )

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["post_id"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} candidate numbers from {len(posts)} posts -> {args.out}")


if __name__ == "__main__":
    main()
