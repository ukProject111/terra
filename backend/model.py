# model.py — prediction logic
# loads trained model from model.pkl, runs forecasts for a given
# region/indicator/year combo, generates insight text

import os
import copy
import joblib
import pandas as pd
from functools import lru_cache
from fastapi import HTTPException
from config import META_DATA
from insights import generate_insight, generate_comparison_insight

base_path = os.path.dirname(__file__)
model_path = os.path.join(base_path, 'model.pkl')
last_known_path = os.path.join(base_path, 'data', 'last_known_values.csv')

# +/- margin for the confidence band around predictions.
# roughly aligned with our MAPE scores from training
CONFIDENCE_PCT = 0.08


@lru_cache
def load_assets():
    """Load model + metadata + last known values once, then cache."""
    try:
        model_map = joblib.load(model_path)
    except Exception as e:
        raise RuntimeError(f"Couldn't load model from {model_path}: {e}")

    metadata = META_DATA
    last_known = pd.read_csv(last_known_path)
    return model_map, metadata, last_known


def _validate(region, indicator, year, metadata):
    regions = metadata.get('regions', [])
    indicators = metadata.get('indicators', [])
    start, end = metadata.get('prediction_range', [2025, 2035])

    if region not in regions:
        raise HTTPException(400, detail=f'Unknown region: {region}')
    if indicator not in indicators:
        raise HTTPException(400, detail=f'Unknown indicator: {indicator}')
    if year < start or year > end:
        raise HTTPException(400, detail=f'Year must be between {start} and {end}')


def _build_feature_row(state, region, year, feature_cols):
    row = {}
    for col in feature_cols:
        if col == 'region':
            row[col] = region
        elif col == 'year':
            row[col] = year
        else:
            row[col] = float(state.get(col, 0.0))
    return pd.DataFrame([row], columns=feature_cols)


def _step_state_forward(state, preds, indicators):
    """After predicting all indicators for one year, update the lag values."""
    for ind in indicators:
        lag1_key = f'{ind}_lag1'
        lag2_key = f'{ind}_lag2'
        growth_key = f'{ind}_growth_rate'

        prev_val = float(state.get(lag1_key, 0.0))
        new_val = float(preds[ind])

        state[lag2_key] = prev_val
        state[lag1_key] = new_val
        if prev_val != 0:
            state[growth_key] = (new_val - prev_val) / prev_val * 100.0
        else:
            state[growth_key] = 0.0


def _get_label(indicator):
    labels = META_DATA.get('indicator_labels', {})
    return labels.get(indicator, indicator.replace('_', ' ').title())


def predict_for_year(region, indicator, year):
    model_map, metadata, last_known = load_assets()
    _validate(region, indicator, year, metadata)

    region_data = last_known[last_known['region'] == region]
    if region_data.empty:
        raise HTTPException(400, detail=f'No data found for {region}')

    # grab the most recent row for this region
    base = region_data.sort_values('year').iloc[-1].to_dict()
    known_year = int(base['year'])

    # check the indicator column actually exists in our data
    if indicator not in base:
        raise HTTPException(400, detail=f'Indicator {indicator} not in dataset')

    baseline_val = float(base[indicator])

    # if asking for a year we already have data for, just return it
    if year <= known_year:
        return {
            'region': region,
            'indicator': indicator,
            'year': year,
            'value': baseline_val,
            'confidence_interval': [baseline_val, baseline_val],
            'source': 'historical',
            'insight': f'{_get_label(indicator)} in {region} was {baseline_val:,.0f} in {year} (historical data).'
        }

    # otherwise step forward from last known year to target
    state = copy.deepcopy(base)
    indicators = metadata['indicators']
    feat_cols = metadata['feature_columns']
    year_preds = {}

    for yr in range(known_year + 1, year + 1):
        year_preds = {}
        for ind in indicators:
            X = _build_feature_row(state, region, yr, feat_cols)
            year_preds[ind] = float(model_map[ind].predict(X)[0])
        _step_state_forward(state, year_preds, indicators)

    predicted = year_preds[indicator]

    # confidence band
    lower = predicted * (1 - CONFIDENCE_PCT)
    upper = predicted * (1 + CONFIDENCE_PCT)

    # work out annual growth for the insight sentence
    if baseline_val != 0:
        total_pct = ((predicted - baseline_val) / baseline_val) * 100
        span = year - known_year
        annual_growth = total_pct / span if span > 0 else total_pct
    else:
        annual_growth = 0.0

    label = _get_label(indicator)
    insight = generate_insight(region, label, annual_growth, known_year, year)

    return {
        'region': region,
        'indicator': indicator,
        'year': year,
        'value': predicted,
        'confidence_interval': [round(lower, 2), round(upper, 2)],
        'source': 'model_forecast',
        'insight': insight,
    }


def compare_two_regions(region1, region2, indicator, year):
    p1 = predict_for_year(region1, indicator, year)
    p2 = predict_for_year(region2, indicator, year)

    v1, v2 = float(p1['value']), float(p2['value'])
    diff = v1 - v2
    pct = (diff / v2 * 100.0) if v2 != 0 else 0.0

    label = _get_label(indicator)
    insight = generate_comparison_insight(region1, region2, label, v1, v2, year)

    if v1 > v2:
        higher = region1
    elif v2 > v1:
        higher = region2
    else:
        higher = 'equal'

    return {
        'year': year,
        'indicator': indicator,
        'region1': {'name': region1, 'value': v1},
        'region2': {'name': region2, 'value': v2},
        'difference': diff,
        'difference_percent_vs_region2': pct,
        'higher_region': higher,
        'insight': insight,
    }
