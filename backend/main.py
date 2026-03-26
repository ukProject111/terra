# main.py — FastAPI backend for the UK Regional Insight app
# run with: uvicorn main:app --reload

import copy
from typing import Optional, List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from config import META_DATA, SIDEBAR_OPTIONS
from model import predict_for_year, compare_two_regions
from analytics import (
    get_timeseries, get_outliers, get_correlation, get_region_statistics,
)

app = FastAPI(
    title='UK Regional Insight API',
    version='1.0.0',
)

# CORS — let the React frontend (port 5173) talk to us.
# in production you'd lock this down to the actual domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# --- core endpoints (per the project spec) ---

@app.get('/')
def health_check():
    return {'status': 'ok'}


@app.get('/regions')
def get_regions():
    return META_DATA.get('regions', [])


@app.get('/indicators')
def get_indicators():
    return META_DATA.get('indicators', [])


@app.get('/predict')
def predict(
    region: str = Query(...),
    indicator: str = Query(...),
    year: int = Query(...),
):
    return predict_for_year(region, indicator, year)


@app.get('/compare')
def compare(
    region1: str = Query(...),
    region2: str = Query(...),
    indicator: str = Query(...),
    year: int = Query(...),
):
    return compare_two_regions(region1, region2, indicator, year)


# --- option endpoints (frontend uses these for dropdowns etc) ---

@app.get('/options/indicators')
def get_indicator_options():
    return META_DATA.get('indicator_labels', {})

@app.get('/options/sidebar')
def get_sidebar_options():
    return SIDEBAR_OPTIONS

@app.get('/options/predict')
def get_predict_options():
    return {'prediction_range': META_DATA.get('prediction_range', [2025, 2035])}

@app.get('/model/info')
def get_model_info():
    """Real accuracy scores from training — shown on the dashboard."""
    return {
        'model_type': META_DATA.get('model_type', 'Unknown'),
        'avg_mape': META_DATA.get('avg_mape', None),
        'scores': META_DATA.get('scores', {}),
    }


# --- analytics (extra features beyond the brief) ---

@app.get('/analytics/timeseries')
def analytics_timeseries(
    indicator: str = Query(...),
    region = Query(None),
    ma_window: int = Query(3),
):
    return get_timeseries(indicator, region, ma_window)

@app.get('/analytics/outliers')
def analytics_outliers(indicator: str = Query(...)):
    return get_outliers(indicator)

@app.get('/analytics/correlation')
def analytics_correlation(indicators: Optional[List[str]] = Query(None)):
    return get_correlation(indicators)

@app.get('/analytics/stats/regions')
def analytics_region_stats(indicator: Optional[str] = Query(None)):
    return get_region_statistics(indicator)
