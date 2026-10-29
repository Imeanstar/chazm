#!/usr/bin/env python3
"""산/구덩이 지표(CCI 기반) 파이썬 구현.

사용 예:
    import pandas as pd
    from cci import cci, state
    df = ...  # 열: o,h,l,c (시간 오름차순)
    df["cci"] = cci(df)
    df["state"] = state(df["cci"])

- cci(): 표준 CCI. (hlc3 - SMA(hlc3,n)) / (0.015 * 평균절대편차)
- state(): "산"(>= +100), "구덩이"(<= -100), "" (중립)
- htf_cci(): 큰 시간대 캔들로 CCI를 구한 뒤 작은 시간대 인덱스에 맞춰 펼친다.
"""
import numpy as np
import pandas as pd


def cci(df: pd.DataFrame, n: int = 20, smooth: int = 1) -> pd.Series:
    tp = (df["h"] + df["l"] + df["c"]) / 3
    ma = tp.rolling(n).mean()
    mad = tp.rolling(n).apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True)
    out = (tp - ma) / (0.015 * mad)
    if smooth > 1:
        out = out.rolling(smooth).mean()
    return out.rename("cci")


def state(c: pd.Series, ob: float = 100, os_: float = -100) -> pd.Series:
    return pd.Series(np.where(c >= ob, "산", np.where(c <= os_, "구덩이", "")), index=c.index)


def resample_ohlc(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """작은 시간대 캔들을 큰 시간대로 합친다. rule 예: '4h', '1D', '3D'"""
    return df.resample(rule).agg({"o": "first", "h": "max", "l": "min", "c": "last"}).dropna()


def htf_cci(df: pd.DataFrame, rule: str, n: int = 20) -> pd.Series:
    h = cci(resample_ohlc(df, rule), n)
    return h.reindex(df.index, method="ffill").rename(f"cci_{rule}")


def turning_points(c: pd.Series, lookback: int = 3, ob: float = 100, os_: float = -100) -> pd.DataFrame:
    """산 뒤 꺾임 / 구덩이 뒤 반등 신호."""
    was_ob = (c >= ob).rolling(lookback + 1).max().fillna(0).astype(bool)
    was_os = (c <= os_).rolling(lookback + 1).max().fillna(0).astype(bool)
    down = was_ob & (c < c.shift()) & (c < ob)
    up = was_os & (c > c.shift()) & (c > os_)
    return pd.DataFrame({"turn_down": down, "turn_up": up})


if __name__ == "__main__":
    # 자가 점검: 급등 뒤 급락 가짜 데이터에서 산 → 구덩이가 나오는지 본다.
    idx = pd.date_range("2026-01-01", periods=120, freq="D", tz="UTC")
    p = np.concatenate([np.linspace(100, 100, 40), np.linspace(100, 140, 30), np.linspace(140, 95, 20), np.linspace(95, 105, 30)])
    df = pd.DataFrame({"o": p, "h": p * 1.01, "l": p * 0.99, "c": p}, index=idx)
    df["cci"] = cci(df)
    df["state"] = state(df["cci"])
    print(df["cci"].describe().round(1))
    print(df[df["state"] != ""]["state"].value_counts())
    print("min:", round(df["cci"].min(), 1), "max:", round(df["cci"].max(), 1))
