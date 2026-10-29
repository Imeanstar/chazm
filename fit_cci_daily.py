#!/usr/bin/env python3
"""방장 일봉 값(data/values_btc.csv)을 평균 길이/편차 길이가 다른 CCI 변형과 맞춘다.
사용법: python3 -I fit_cci_daily.py  (data/proxy_BTCUSD_1d.csv, _1h.csv 필요)
"""
import pandas as pd, numpy as np, itertools
vals=pd.read_csv('data/values_btc.csv'); vals['datetime']=pd.to_datetime(vals.datetime,utc=True)
vals=vals[(vals.tf=='1d')&(vals.datetime>='2026-10-01')].reset_index(drop=True); y=vals.value.values.astype(float)
d=pd.read_csv('data/proxy_BTCUSD_1d.csv',index_col=0,parse_dates=True)
h=pd.read_csv('data/proxy_BTCUSD_1h.csv',index_col=0,parse_dates=True)
def series_at(t):
    day=t.floor('D'); hist=d[d.index<day]; part=h[(h.index>=day)&(h.index<=t)]
    last=pd.DataFrame({'o':[part.o.iloc[0]],'h':[part.h.max()],'l':[part.l.min()],'c':[part.c.iloc[-1]],'v':[part.v.sum()]},index=[day])
    return pd.concat([hist,last])
dfs=[series_at(t) for t in vals.datetime]
res=[]
for n1 in (40,50,55,60,65,70,80,100):
  for n2 in (10,14,20,30,40,50,60,80,100):
    for dev in ('mad_own','mad_n2','std_n2','atr'):
        xs=[]
        for df in dfs:
            tp=(df.h+df.l+df.c)/3; m=tp.rolling(n1).mean()
            if dev=='mad_own': dv=(tp-m).abs().rolling(n2).mean()
            elif dev=='mad_n2': dv=(tp-tp.rolling(n2).mean()).abs().rolling(n2).mean()
            elif dev=='std_n2': dv=tp.rolling(n2).std()
            else:
                tr=pd.concat([df.h-df.l,(df.h-df.c.shift()).abs(),(df.l-df.c.shift()).abs()],axis=1).max(axis=1); dv=tr.rolling(n2).mean()
            xs.append(((tp-m)/(0.015*dv)).iloc[-1])
        x=np.array(xs); a=np.dot(x,y)/np.dot(x,x); raw=np.sqrt(np.mean((x-y)**2)); rm=np.sqrt(np.mean((a*x-y)**2))
        res.append((raw,rm,a,f'SMA{n1} / {dev}({n2})'))
res.sort()
print('raw(a=1) 기준 상위:')
for r in res[:12]: print(f' raw={r[0]:5.1f} fit={r[1]:5.1f} a={r[2]:4.2f} {r[3]}')
