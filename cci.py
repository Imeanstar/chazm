#!/usr/bin/env python3
"""산/구덩이 지표(수정 CCI) 파이썬 구현.

사용 예:
    import pandas as pd
    from cci import cci, state
    df = ...  # 열: o,h,l,c (시간 오름차순)
    df["short"] = cci(df, 20)                 # 단기: 표준 CCI(20)
    df["mid"]   = cci(df, 60, dev_len=50, dev="std")   # 중기: 방장 일봉 값과 가장 가까운 설정
    df["state"] = state(df["mid"])

- cci(): (src - SMA(src, n)) / (0.015 * 편차). 편차는 평균절대편차(mad) 또는 표준편차(std).
  dev_len을 주면 편차만 다른 길이로 계산한다.
- state(): "산"(>= +100), "구덩이"(<= -100), "" (중립)
- htf_cci(): 큰 시간대 캔들로 계산한 뒤 작은 시간대 인덱스에 맞춰 펼친다.
"""
import numpy as np
import pandas as pd


def _source(df: pd.DataFrame, src: str) -> pd.Series:
    if src == "hlc3":
        return (df["h"] + df["l"] + df["c"]) / 3
    if src == "ohlc4":
        return (df["o"] + df["h"] + df["l"] + df["c"]) / 4
    return df["c"]


def cci(df: pd.DataFrame, n: int = 20, dev_len: int | None = None, dev: str = "mad", src: str = "hlc3") -> pd.Series:
    tp = _source(df, src)
    ma = tp.rolling(n).mean()
    m = dev_len or n
    if dev == "std":
        d = tp.rolling(m).std()
    else:
        d = tp.rolling(m).apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True)
    return ((tp - ma) / (0.015 * d)).rename("cci")


def state(c: pd.Series, ob: float = 100, os_: float = -100) -> pd.Series:
    return pd.Series(np.where(c >= ob, "산", np.where(c <= os_, "구덩이", "")), index=c.index)


def resample_ohlc(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """작은 시간대 캔들을 큰 시간대로 합친다. rule 예: '4h', '1D', '3D'"""
    return df.resample(rule).agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()


def htf_cci(df: pd.DataFrame, rule: str, n: int = 20, **kw) -> pd.Series:
    h = cci(resample_ohlc(df, rule), n, **kw)
    return h.reindex(df.index, method="ffill").rename(f"cci_{rule}")


def turning_points(c: pd.Series, lookback: int = 3, ob: float = 100, os_: float = -100) -> pd.DataFrame:
    """산 뒤 꺾임 / 구덩이 뒤 반등 신호."""
    was_ob = (c >= ob).rolling(lookback + 1).max().fillna(0).astype(bool)
    was_os = (c <= os_).rolling(lookback + 1).max().fillna(0).astype(bool)
    down = was_ob & (c < c.shift()) & (c < ob)
    up = was_os & (c > c.shift()) & (c > os_)
    return pd.DataFrame({"turn_down": down, "turn_up": up})


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "data/upbit_KRW-BTC_1d.csv"
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    out = pd.DataFrame({"close": df.c, "short20": cci(df, 20), "mid60": cci(df, 60, 50, "std")})
    out["state"] = state(out["mid60"])
    print(out.tail(15).round(1).to_string())
