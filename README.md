# 텔레그램 채널 지표 역분석

텔레그램 채널 `t.me/coin500Bking` 방장이 쓰는 개인 지표값을 모아, 어떤 공식으로 만든 값인지 찾는 프로젝트다.

**결론: 방장이 직접 "cci, 수정값"이라고 밝힌 수정 CCI다.** 채널 글 11,105건과 업비트 캔들로 맞춘 결과, 근거, 매매 규칙은 `ANALYSIS.md`에 있다.

## 바로 쓰기

- 트레이딩뷰: `indicator_mountain_pit.pine` 내용을 Pine 에디터에 붙여 넣고 저장한다.
- 파이썬: `cci.py`의 `cci(df)` 를 쓴다.

## 절차

1. 채널 글을 모은다.

```bash
python3 -I scrape_tg.py coin500Bking data/posts.json
```

2. 글에서 지표값 후보 숫자를 뽑는다. 결과를 열어 보고 진짜 지표값만 남긴다.

```bash
python3 -I extract_values.py data/posts.json data/candidates.csv --keyword 지표
```

3. 확정한 값을 `data/values.csv`에 아래 형식으로 적는다.

```
datetime,symbol,value
2026-10-20 09:00,BTCUSDT,37.2
```

4. 후보 지표 공식과 비교한다. 오차(rmse)가 작은 순으로 나온다.

```bash
pip install -r requirements.txt
python3 -I fit_indicator.py data/values.csv --exchange binance --symbol BTCUSDT --interval 4h
```

5. 맞는 공식을 찾으면 Pine Script와 파이썬 함수로 정리한다.

## 네트워크

이 스크립트는 `t.me`, `api.binance.com`, `api.upbit.com`에 접속한다. 클라우드 세션에서는 환경 설정의 Allowed domains에 이 호스트를 추가해야 한다.

## 파일

- `ANALYSIS.md` : 역분석 결과와 매매 규칙
- `indicator_mountain_pit.pine` : 트레이딩뷰 복제 지표
- `cci.py` : 파이썬 구현
- `verify_posts.py` : 방장 값과 계산값 비교

- `scrape_tg.py` : 공개 채널 글 수집
- `extract_values.py` : 글에서 숫자와 문맥 추출
- `fit_indicator.py` : 캔들 수집 + 후보 지표 계산 + 최소제곱 맞춤
- `data/` : 수집 결과 (git에 올리지 않음)
