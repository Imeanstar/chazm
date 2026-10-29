#!/usr/bin/env python3
"""방장 일봉 수치(values_btc.csv)를 여러 '정규화 MACD' 후보와 맞춰 본다.

핵심:
- 방장이 글에서 "MACD (L/HTF 수정값)"이라고 했다. 값은 ±100이 과매수/과매도 기준이고
  BTC, USDT 도미넌스가 같은 크기라서 가격 단위를 없앤 MACD다.
- 실시간 수치는 진행 중인 일봉이므로, 1시간봉으로 부분 일봉을 만들어 넣는다.

사용법:
    python3 -I fit_macd.py data/values_btc.csv data/upbit_USDT-BTC_1d.csv data/upbit_USDT-BTC_1h.csv
"""
import itertools
import sys

import numpy as np
import pandas as pd


def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def atr(df, n):
    tr = pd.concat([df.h - df.l, (df.h - df.c.shift()).abs(), (df.l - df.c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def load(values_csv, d_csv, h_csv):
    vals = pd.read_csv(values_csv)
    vals["datetime"] = pd.to_datetime(vals["datetime"], utc=True)
    vals = vals[vals.tf == "1d"].reset_index(drop=True)
    d = pd.read_csv(d_csv, index_col=0, parse_dates=True)
    h = pd.read_csv(h_csv, index_col=0, parse_dates=True)
    return vals, d, h


def series_at(d, h, t):
    """시각 t 기준 일봉 시리즈. 마지막 봉은 t까지의 부분 봉."""
    day = t.floor("D")
    hist = d[d.index < day]
    part = h[(h.index >= day) & (h.index < t + pd.Timedelta(hours=1))]
    if len(part) == 0:
        return hist
    last = pd.DataFrame({"o": [part.o.iloc[0]], "h": [part.h.max()], "l": [part.l.min()], "c": [part.c.iloc[-1]], "v": [part.v.sum()]}, index=[day])
    return pd.concat([hist, last])


def candidates(df):
    c = df.c
    out = {}
    norms = {
        "close%": lambda s: 100 * s / c,
        "closebp": lambda s: 10000 * s / c,
        "atr14": lambda s: s / atr(df, 14),
        "atr20": lambda s: s / atr(df, 20),
        "std20": lambda s: s / c.rolling(20).std(),
        "std50": lambda s: s / c.rolling(50).std(),
    }
    for f, s in itertools.product((3, 5, 6, 8, 10, 12, 13, 15, 20), (10, 13, 17, 20, 21, 26, 30, 34, 40, 50, 60)):
        if s <= f:
            continue
        macd = ema(c, f) - ema(c, s)
        for sig in (5, 7, 9):
            hist = macd - ema(macd, sig)
            for nn, fn in norms.items():
                out[f"MACD({f},{s})/{nn}"] = fn(macd)
                out[f"HIST({f},{s},{sig})/{nn}"] = fn(hist)
                out[f"SIG({f},{s},{sig})/{nn}"] = fn(ema(macd, sig))
    # 비교용 다른 계열
    for n in (10, 14, 20, 30, 50):
        tp = (df.h + df.l + df.c) / 3
        ma = tp.rolling(n).mean()
        md = (tp - ma).abs().rolling(n).mean()
        out[f"CCI({n})"] = (tp - ma) / (0.015 * md)
        out[f"Z({n})x100"] = 100 * (c - c.rolling(n).mean()) / c.rolling(n).std()
        out[f"SMAdev({n})x10"] = 1000 * (c - c.rolling(n).mean()) / c.rolling(n).mean()
    return out


def main():
    vals, d, h = load(*sys.argv[1:4])
    # 각 시점의 지표값 테이블: rows=시점, cols=후보
    rows = []
    for _, r in vals.iterrows():
        df = series_at(d, h, r.datetime)
        cand = candidates(df)
        rows.append({k: v.iloc[-1] for k, v in cand.items()})
    X = pd.DataFrame(rows)
    y = vals.value.values.astype(float)

    res = []
    for k in X.columns:
        x = X[k].values
        if np.isnan(x).any():
            continue
        # 원점 통과 스케일 a
        a0 = float(np.dot(x, y) / np.dot(x, x)) if np.dot(x, x) > 0 else 0
        rmse0 = float(np.sqrt(np.mean((a0 * x - y) ** 2)))
        corr = float(np.corrcoef(x, y)[0, 1])
        # 자유 절편
        a1, b1 = np.polyfit(x, y, 1)
        rmse1 = float(np.sqrt(np.mean((a1 * x + b1 - y) ** 2)))
        res.append({"cand": k, "corr": corr, "a0": a0, "rmse0": rmse0, "a1": a1, "b1": b1, "rmse1": rmse1})
    res = pd.DataFrame(res).sort_values("rmse0")
    pd.set_option("display.width", 200)
    print("=== 원점 통과(a*x) 기준 상위 ===")
    print(res.head(30).to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print("\n=== 상관계수 기준 상위 ===")
    print(res.sort_values("corr", ascending=False).head(15).to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    res.to_csv("data/fit_macd_results.csv", index=False)
    X.assign(posted=y, datetime=vals.datetime.values).to_csv("data/fit_macd_matrix.csv", index=False)


if __name__ == "__main__":
    main()
