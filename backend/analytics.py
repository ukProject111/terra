# analytics.py — extra analytics endpoints
# timeseries with moving average, outlier detection, correlation matrix, region stats

import os
import json
from functools import lru_cache
from typing import Optional, List

import joblib
import pandas as pd
from fastapi import HTTPException

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, 'model.pkl')
ANALYTICS_DATA_PATH = os.path.join(BASE_DIR, 'data', 'ml_ready_dataset.csv')

# fallback list if metadata.json is missing for some reason
INDICATORS_FALLBACK = [
    'population', 'employment_rate', 'average_house_price',
    'rental_index', 'housing_completions',
]


@lru_cache
def load_metadata():
    meta_path = os.path.join(BASE_DIR, 'metadata.json')
    if os.path.exists(meta_path):
        with open(meta_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'indicators': INDICATORS_FALLBACK}


@lru_cache
def load_analytics_data():
    if not os.path.exists(ANALYTICS_DATA_PATH):
        raise RuntimeError(f'Analytics dataset not found at {ANALYTICS_DATA_PATH}')

    df = pd.read_csv(ANALYTICS_DATA_PATH)

    # sanity check — we need region and year at minimum
    if 'region' not in df.columns or 'year' not in df.columns:
        raise RuntimeError('Dataset missing region or year column')

    df['year'] = pd.to_numeric(df['year'], errors='coerce')
    df = df.dropna(subset=['year']).copy()
    df['year'] = df['year'].astype(int)
    return df.sort_values(['region', 'year']).reset_index(drop=True)


def _get_indicators():
    meta = load_metadata()
    inds = meta.get('indicators', [])
    if inds:
        return inds
    # try to figure it out from the data
    df = load_analytics_data()
    return [c for c in INDICATORS_FALLBACK if c in df.columns]


def _check_indicator(indicator):
    if indicator not in _get_indicators():
        raise HTTPException(400, detail=f'Unknown indicator: {indicator}')


def get_timeseries(indicator, region=None, ma_window=3):
    _check_indicator(indicator)
    if ma_window not in (3, 5):
        raise HTTPException(400, detail='ma_window must be 3 or 5')

    df = load_analytics_data().copy()

    if region is not None:
        if region not in df['region'].unique():
            raise HTTPException(400, detail=f'Unknown region: {region}')
        df = df[df['region'] == region].copy()

    # moving average and year-on-year growth
    df['moving_average'] = (
        df.groupby('region')[indicator]
          .transform(lambda s: s.rolling(window=ma_window, min_periods=1).mean())
    )
    df['growth_yoy'] = df.groupby('region')[indicator].pct_change() * 100.0

    out = df[['region', 'year', indicator, 'moving_average', 'growth_yoy']].copy()
    out = out.rename(columns={indicator: 'value'})
    out['growth_yoy'] = out['growth_yoy'].fillna(0.0)

    return {
        'indicator': indicator,
        'region': region,
        'ma_window': ma_window,
        'series': out.to_dict(orient='records'),
    }


def get_outliers(indicator):
    _check_indicator(indicator)
    df = load_analytics_data()

    if indicator not in df.columns:
        return {'indicator': indicator, 'bounds': {}, 'count': 0, 'outliers': []}

    q1 = df[indicator].quantile(0.25)
    q3 = df[indicator].quantile(0.75)
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr

    mask = (df[indicator] < lo) | (df[indicator] > hi)
    hits = df[mask][['region', 'year', indicator]].rename(columns={indicator: 'value'})

    return {
        'indicator': indicator,
        'bounds': {'lower': float(lo), 'upper': float(hi)},
        'count': len(hits),
        'outliers': hits.to_dict(orient='records'),
    }


def get_correlation(indicators=None):
    df = load_analytics_data()
    cols = indicators if indicators else _get_indicators()

    bad = [c for c in cols if c not in df.columns]
    if bad:
        raise HTTPException(400, detail=f'Columns not in data: {bad}')

    corr = df[cols].corr().round(4)

    # top correlated pairs
    pairs = []
    for i, c1 in enumerate(cols):
        for c2 in cols[i+1:]:
            pairs.append({'x': c1, 'y': c2, 'corr': float(corr.loc[c1, c2])})

    top = sorted(pairs, key=lambda p: abs(p['corr']), reverse=True)[:10]

    return {
        'columns': cols,
        'matrix': corr.to_dict(),
        'top_pairs': top,
    }


def get_region_statistics(indicator=None):
    df = load_analytics_data()
    indicators = [indicator] if indicator else _get_indicators()

    for col in indicators:
        _check_indicator(col)

    payload = {}
    for col in indicators:
        if col not in df.columns:
            continue
        stats = (
            df.groupby('region')[col]
              .agg(['mean', 'median', 'std', 'min', 'max', 'count'])
              .round(4)
              .reset_index()
        )
        payload[col] = stats.to_dict(orient='records')

    return {'stats': payload}
