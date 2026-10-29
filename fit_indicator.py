#!/usr/bin/env python3
"""방장이 올린 지표값을 여러 후보 지표 공식과 비교해 가장 잘 맞는 공식을 찾는다.

입력 CSV(values.csv) 형식:
    datetime,symbol,value
    2026-10-20 09:00,BTCUSDT,37.2

사용법:
    python3 -I fit_indicator.py data/values.csv --exchange binance --interval 4h
    python3 -I fit_indicator.py data/values.csv --exchange upbit --interval 240 --symbol KRW-BTC

동작:
1. 거래소 공개 API로 캔들(OHLCV)을 받는다.
2. 후보 지표(RSI, MFI, 스토캐스틱, CCI, %R, 볼린저 %B, 이동평균 괴리율, ROC, 거래량 비율 ...)를
   여러 기간 값으로 계산한다.
3. 각 후보에 대해 posted_value ≈ a * indicator + b 의 최소제곱 맞춤을 한다.
   (방장이 0~100 또는 -100~100 같은 자기 스케일로 바꿨을 수 있어서 선형 변환을 허용한다.)
4. 오차(RMSE)가 작은 순으로 상위 후보를 출력한다.
"""
import argparse
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import requests

# ---------- 캔들 수집 ----------

def fetch_binance(symbol: str, interval: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    url = "https://api.binance.com/api/v3/klines"
    rows = []
    cur = start_ms
    while cur < end_ms:
        r = requests.get(url, params={"symbol": symbol, "interval": interval, "startTime": cur, "limit": 1000}, timeout=30)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        cur = batch[-1][0] + 1
        if len(batch) < 1000:
            break
    df = pd.DataFrame(rows, columns=["t", "o", "h", "l", "c", "v", "ct", "qv", "n", "tb", "tq", "ig"])
    df = df[["t", "o", "h", "l", "c", "v"]].astype(float)
    df["t"] = pd.to_datetime(df["t"], unit="ms", utc=True)
    return df.set_index("t")


def fetch_upbit(market: str, unit: str, start: datetime, end: datetime) -> pd.DataFrame:
    # unit: 1,3,5,15,10,30,60,240 (분) 또는 "day"
    if unit == "day":
        url = "https://api.upbit.com/v1/candles/days"
    else:
        url = f"https://api.upbit.com/v1/candles/minutes/{unit}"
    rows = []
    to = end
    while True:
        r = requests.get(url, params={"market": market, "count": 200, "to": to.strftime("%Y-%m-%dT%H:%M:%SZ")}, timeout=30)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        oldest = datetime.fromisoformat(batch[-1]["candle_date_time_utc"]).replace(tzinfo=timezone.utc)
        if oldest <= start or len(batch) < 200:
            break
        to = oldest
    df = pd.DataFrame(rows)
    df["t"] = pd.to_datetime(df["candle_date_time_utc"], utc=True)
    df = df.rename(columns={"opening_price": "o", "high_price": "h", "low_price": "l", "trade_price": "c", "candle_acc_trade_volume": "v"})
    df = df[["t", "o", "h", "l", "c", "v"]].astype({"o": float, "h": float, "l": float, "c": float, "v": float})
    return df.drop_duplicates("t").sort_values("t").set_index("t")


# ---------- 후보 지표 ----------

def rsi(c, n):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def mfi(df, n):
    tp = (df.h + df.l + df.c) / 3
    mf = tp * df.v
    pos = mf.where(tp > tp.shift(), 0.0).rolling(n).sum()
    neg = mf.where(tp < tp.shift(), 0.0).rolling(n).sum()
    return 100 - 100 / (1 + pos / neg)


def stoch_k(df, n):
    lo, hi = df.l.rolling(n).min(), df.h.rolling(n).max()
    return 100 * (df.c - lo) / (hi - lo)


def williams_r(df, n):
    return stoch_k(df, n) - 100


def cci(df, n):
    tp = (df.h + df.l + df.c) / 3
    ma = tp.rolling(n).mean()
    md = (tp - ma).abs().rolling(n).mean()
    return (tp - ma) / (0.015 * md)


def bb_pct(c, n, k=2.0):
    ma, sd = c.rolling(n).mean(), c.rolling(n).std()
    return (c - (ma - k * sd)) / (2 * k * sd)


def ma_dev(c, n, ema=False):
    ma = c.ewm(span=n, adjust=False).mean() if ema else c.rolling(n).mean()
    return 100 * (c - ma) / ma


def roc(c, n):
    return 100 * (c / c.shift(n) - 1)


def vol_ratio(v, n):
    return v / v.rolling(n).mean()


def atr_pct(df, n):
    tr = pd.concat([df.h - df.l, (df.h - df.c.shift()).abs(), (df.l - df.c.shift()).abs()], axis=1).max(axis=1)
    return 100 * tr.ewm(alpha=1 / n, adjust=False).mean() / df.c


def candidates(df):
    out = {}
    for n in (5, 7, 9, 10, 12, 14, 20, 21, 25, 30, 50):
        out[f"RSI({n})"] = rsi(df.c, n)
        out[f"MFI({n})"] = mfi(df, n)
        out[f"StochK({n})"] = stoch_k(df, n)
        out[f"StochD({n},3)"] = stoch_k(df, n).rolling(3).mean()
        out[f"W%R({n})"] = williams_r(df, n)
        out[f"CCI({n})"] = cci(df, n)
        out[f"BB%B({n})"] = bb_pct(df.c, n)
        out[f"SMAdev({n})"] = ma_dev(df.c, n)
        out[f"EMAdev({n})"] = ma_dev(df.c, n, ema=True)
        out[f"ROC({n})"] = roc(df.c, n)
        out[f"VolRatio({n})"] = vol_ratio(df.v, n)
        out[f"ATR%({n})"] = atr_pct(df, n)
    for n in (60, 100, 120, 200):
        out[f"SMAdev({n})"] = ma_dev(df.c, n)
        out[f"EMAdev({n})"] = ma_dev(df.c, n, ema=True)
        out[f"RSI({n})"] = rsi(df.c, n)
    # 조합형: RSI 평균, RSI + MFI 평균 등 (방장이 섞어 썼을 가능성)
    out["avg(RSI14,MFI14)"] = (out["RSI(14)"] + out["MFI(14)"]) / 2
    out["avg(RSI14,StochK14)"] = (out["RSI(14)"] + out["StochK(14)"]) / 2
    out["StochRSI(14)"] = stoch_rsi(df.c, 14)
    return out


def stoch_rsi(c, n):
    r = rsi(c, n)
    return 100 * (r - r.rolling(n).min()) / (r.rolling(n).max() - r.rolling(n).min())


# ---------- 맞춤 ----------

def fit(posted: pd.Series, series: pd.Series, allow_affine: bool):
    """posted 값과 지표를 같은 시각으로 맞춘 뒤 오차를 구한다."""
    x = series.reindex(posted.index, method="ffill")
    mask = x.notna() & posted.notna()
    if mask.sum() < 3:
        return None
    x, y = x[mask].values, posted[mask].values
    if allow_affine:
        a, b = np.polyfit(x, y, 1)
    else:
        a, b = 1.0, 0.0
    pred = a * x + b
    rmse = float(np.sqrt(np.mean((pred - y) ** 2)))
    corr = float(np.corrcoef(x, y)[0, 1]) if np.std(x) > 0 else 0.0
    return {"rmse": rmse, "corr": corr, "a": a, "b": b, "n": int(mask.sum())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("values_csv")
    ap.add_argument("--exchange", choices=["binance", "upbit"], default="binance")
    ap.add_argument("--symbol", default=None, help="binance: BTCUSDT / upbit: KRW-BTC (CSV의 symbol 열보다 우선)")
    ap.add_argument("--interval", default="4h", help="binance: 1h,4h,1d / upbit: 60,240,day")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--no-affine", action="store_true", help="a*x+b 변환 없이 원값 그대로 비교")
    args = ap.parse_args()

    vals = pd.read_csv(args.values_csv)
    vals["datetime"] = pd.to_datetime(vals["datetime"], utc=True)
    symbol = args.symbol or vals["symbol"].iloc[0]
    posted = vals.set_index("datetime")["value"].sort_index()

    start = posted.index.min() - pd.Timedelta(days=120)
    end = posted.index.max() + pd.Timedelta(days=1)
    if args.exchange == "binance":
        df = fetch_binance(symbol, args.interval, int(start.timestamp() * 1000), int(end.timestamp() * 1000))
    else:
        df = fetch_upbit(symbol, args.interval, start.to_pydatetime(), end.to_pydatetime())
    print(f"candles: {len(df)}  ({df.index.min()} ~ {df.index.max()})", file=sys.stderr)

    results = []
    for name, s in candidates(df).items():
        r = fit(posted, s, not args.no_affine)
        if r:
            results.append({"indicator": name, **r})
    res = pd.DataFrame(results).sort_values("rmse")
    pd.set_option("display.width", 160)
    print(res.head(args.top).to_string(index=False, float_format=lambda v: f"{v:.3f}"))


if __name__ == "__main__":
    main()
