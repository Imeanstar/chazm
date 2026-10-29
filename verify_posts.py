#!/usr/bin/env python3
"""방장이 올린 일봉 값과 CCI 계산값을 비교한다. (네트워크가 열리면 실행)

방장 값 (2026년 10월 말, 날짜는 글 순서로 추정):
    비트 일봉 -17  (테더 도미 +24)
    비트 일봉 -36  (테더 도미 +46)
    "현재 실시간 +30대"

사용법:
    python3 -I verify_posts.py 2026-10-26 -17 2026-10-27 -36
    옵션: --symbol BTCUSDT --interval 1d --lengths 14,20,30
"""
import argparse
import sys

import pandas as pd

from cci import cci
from fit_indicator import fetch_binance


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pairs", nargs="+", help="날짜 값 날짜 값 ... (UTC 기준 봉 날짜)")
    ap.add_argument("--symbol", default="BTCUSDT")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--lengths", default="10,14,20,25,30,50")
    args = ap.parse_args()
    if len(args.pairs) % 2:
        sys.exit("날짜와 값은 짝으로 적는다")

    posted = {pd.Timestamp(d, tz="UTC"): float(v) for d, v in zip(args.pairs[::2], args.pairs[1::2])}
    start = min(posted) - pd.Timedelta(days=200)
    end = max(posted) + pd.Timedelta(days=2)
    df = fetch_binance(args.symbol, args.interval, int(start.timestamp() * 1000), int(end.timestamp() * 1000))

    rows = []
    for n in (int(x) for x in args.lengths.split(",")):
        c = cci(df, n)
        for d, v in posted.items():
            got = c.reindex([d], method="ffill").iloc[0]
            rows.append({"len": n, "date": d.date(), "posted": v, "cci": round(got, 1), "diff": round(got - v, 1)})
    out = pd.DataFrame(rows)
    print(out.to_string(index=False))
    print("\n기간별 평균 절대 오차:")
    print(out.groupby("len")["diff"].apply(lambda s: s.abs().mean()).round(1).to_string())


if __name__ == "__main__":
    main()
