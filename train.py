# train.py
# trains three regression models on the processed dataset, compares them
# by MAPE and RMSE, and saves the winner as models/model.pkl
#
# models: Linear Regression (baseline), Random Forest, Gradient Boosting
# target: MAPE <= 8% on the test set
#
# usage: python train.py

import os
import json
import warnings
import datetime

import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import GridSearchCV
from sklearn.base import clone
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error

warnings.filterwarnings('ignore', category=FutureWarning)

# ── paths ────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DATA_PATH    = os.path.join(BASE_DIR, 'data', 'processed', 'master_dataset.csv')
MODEL_DIR    = os.path.join(BASE_DIR, 'models')
BACKEND_DIR  = os.path.join(BASE_DIR, 'backend')
MODEL_PATH   = os.path.join(MODEL_DIR, 'model.pkl')
META_PATH    = os.path.join(BASE_DIR, 'backend', 'metadata.json')

INDICATORS = [
    'population',
    'employment_rate',
    'average_house_price',
    'rental_index',
    'housing_completions',
]

# features the model uses (lag values + growth rates + year + region)
FEATURE_COLS = [
    'year',
    'population_lag1', 'population_lag2',
    'employment_rate_lag1', 'employment_rate_lag2',
    'average_house_price_lag1', 'average_house_price_lag2',
    'rental_index_lag1', 'rental_index_lag2',
    'housing_completions_lag1', 'housing_completions_lag2',
    'population_growth_rate',
    'employment_rate_growth_rate',
    'average_house_price_growth_rate',
    'rental_index_growth_rate',
    'housing_completions_growth_rate',
    'region',
]

NUMERIC_COLS = [c for c in FEATURE_COLS if c != 'region']
CAT_COLS     = ['region']

# chronological split — never shuffle time series!
TRAIN_CUTOFF = 2019   # train on everything up to 2019
                       # test on 2020 onwards


def mape(y_true, y_pred):
    """Mean Absolute Percentage Error, handles zeros safely."""
    mask = y_true != 0
    if mask.sum() == 0:
        return 0.0
    return mean_absolute_percentage_error(y_true[mask], y_pred[mask]) * 100


def rmse(y_true, y_pred):
    return np.sqrt(mean_squared_error(y_true, y_pred))


def build_preprocessor():
    """Column transformer: scale numerics, one-hot encode region."""
    return ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), NUMERIC_COLS),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), CAT_COLS),
        ],
        remainder='drop'
    )


def get_candidate_models():
    """Return a dict of model_name -> (Pipeline, param_grid_for_tuning)."""
    pre = build_preprocessor()

    models = {
        'LinearRegression': (
            Pipeline([('preprocessor', pre), ('model', LinearRegression())]),
            {}   # nothing to tune for LR
        ),
        'RandomForest': (
            Pipeline([('preprocessor', pre),
                       ('model', RandomForestRegressor(random_state=42))]),
            {
                'model__n_estimators': [100, 200],
                'model__max_depth':    [6, 10, None],
            }
        ),
        'GradientBoosting': (
            Pipeline([('preprocessor', pre),
                       ('model', GradientBoostingRegressor(random_state=42))]),
            {
                'model__n_estimators':  [150, 200],
                'model__learning_rate': [0.05, 0.1],
                'model__max_depth':     [3, 4],
                'model__subsample':     [0.8],
            }
        ),
    }
    return models


def train_and_evaluate():
    print('=== Model Training ===')
    print()

    # load data
    if not os.path.exists(DATA_PATH):
        print(f'[error] Dataset not found: {DATA_PATH}')
        print('        Run data_pipeline.py first.')
        return

    df = pd.read_csv(DATA_PATH)
    print(f'Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns')
    print(f'Regions: {sorted(df["region"].unique())}')
    print(f'Years: {df["year"].min()} - {df["year"].max()}')
    print()

    # add lag and growth features if they're not already in the csv
    df = df.sort_values(['region', 'year']).copy()
    for col in INDICATORS:
        lag1 = f'{col}_lag1'
        lag2 = f'{col}_lag2'
        growth = f'{col}_growth_rate'
        if lag1 not in df.columns:
            df[lag1] = df.groupby('region')[col].shift(1)
        if lag2 not in df.columns:
            df[lag2] = df.groupby('region')[col].shift(2)
        if growth not in df.columns:
            df[growth] = df.groupby('region')[col].pct_change() * 100.0

    # check we have everything now
    missing_features = [c for c in FEATURE_COLS if c not in df.columns]
    if missing_features:
        print(f'[error] Still missing columns: {missing_features}')
        return

    # drop rows with NaN in features or targets
    needed = FEATURE_COLS + INDICATORS
    df = df.dropna(subset=[c for c in needed if c in df.columns])
    print(f'After dropping NaN: {df.shape[0]} rows')

    # chronological train/test split — crucial for time series
    train_df = df[df['year'] <= TRAIN_CUTOFF].copy()
    test_df  = df[df['year'] >  TRAIN_CUTOFF].copy()

    print(f'Train set: {len(train_df)} rows (up to {TRAIN_CUTOFF})')
    print(f'Test set:  {len(test_df)} rows ({TRAIN_CUTOFF+1} onwards)')
    print()

    if len(test_df) == 0:
        print('[warn] Empty test set — using last 20% of data instead')
        split_idx = int(len(df) * 0.8)
        train_df = df.iloc[:split_idx].copy()
        test_df  = df.iloc[split_idx:].copy()
        print(f'  Train: {len(train_df)}, Test: {len(test_df)}')

    X_train = train_df[FEATURE_COLS]
    X_test  = test_df[FEATURE_COLS]

    # ── train each indicator separately ──────────────────────────────
    candidates = get_candidate_models()
    results_table = []          # for the comparison printout
    best_pipelines = {}         # indicator -> best pipeline
    winning_model_name = None
    best_avg_mape = float('inf')

    # we'll collect per-model average MAPE to pick the overall winner
    model_avg_mapes = {name: [] for name in candidates}

    for indicator in INDICATORS:
        print(f'--- {indicator} ---')

        y_train = train_df[indicator].values
        y_test  = test_df[indicator].values

        indicator_results = {}

        for model_name, (pipeline, param_grid) in candidates.items():
            pipe = clone(pipeline)

            if param_grid:
                # tune with grid search (3-fold CV on the training set)
                gs = GridSearchCV(
                    pipe, param_grid,
                    cv=3, scoring='neg_mean_absolute_error',
                    n_jobs=-1, verbose=0
                )
                gs.fit(X_train, y_train)
                pipe = gs.best_estimator_
                best_params = gs.best_params_
            else:
                pipe.fit(X_train, y_train)
                best_params = {}

            preds = pipe.predict(X_test)
            m = mape(y_test, preds)
            r = rmse(y_test, preds)

            indicator_results[model_name] = {
                'pipeline': pipe,
                'mape': m,
                'rmse': r,
                'params': best_params,
            }
            model_avg_mapes[model_name].append(m)

            results_table.append({
                'indicator': indicator,
                'model': model_name,
                'MAPE (%)': round(m, 4),
                'RMSE': round(r, 4),
            })

            status = 'OK' if m <= 8.0 else 'ABOVE TARGET'
            print(f'  {model_name:25s}  MAPE={m:7.3f}%  RMSE={r:12.2f}  [{status}]')

        print()

    # ── pick the overall best model type ─────────────────────────────
    print()
    print('=== Model Comparison (average MAPE across all indicators) ===')

    for name in candidates:
        avg = np.mean(model_avg_mapes[name])
        print(f'  {name:25s}  avg MAPE = {avg:.4f}%')
        if avg < best_avg_mape:
            best_avg_mape = avg
            winning_model_name = name

    print()
    print(f'Winner: {winning_model_name}  (avg MAPE = {best_avg_mape:.4f}%)')

    if best_avg_mape > 8.0:
        print(f'[note] Average MAPE is {best_avg_mape:.2f}% — above the 8% target.')
        print('       Documenting honestly as required by the brief.')
    else:
        print(f'[pass] Average MAPE {best_avg_mape:.2f}% is within the 8% target.')

    # ── retrain the winning model on ALL data and save ───────────────
    print()
    print(f'Retraining {winning_model_name} on full dataset for deployment...')

    X_full = df[FEATURE_COLS]
    final_pipelines = {}

    # get fresh copies of the candidate models for retraining
    fresh_candidates = get_candidate_models()

    for indicator in INDICATORS:
        y_full = df[indicator].values
        pipeline, param_grid = fresh_candidates[winning_model_name]

        pipe = clone(pipeline)

        if param_grid:
            gs = GridSearchCV(
                pipe, param_grid,
                cv=3, scoring='neg_mean_absolute_error',
                n_jobs=-1, verbose=0
            )
            gs.fit(X_full, y_full)
            pipe = gs.best_estimator_
        else:
            pipe.fit(X_full, y_full)

        final_pipelines[indicator] = pipe
        print(f'  {indicator}: trained')

    # save the model dict
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(final_pipelines, MODEL_PATH)
    print(f'  Saved: {MODEL_PATH}')

    # also copy to backend/ so the server can find it
    backend_model_path = os.path.join(BACKEND_DIR, 'model.pkl')
    joblib.dump(final_pipelines, backend_model_path)
    print(f'  Copied to: {backend_model_path}')

    # ── save last known values for the predict endpoint ──────────────
    last_known = df.sort_values('year').groupby('region').last().reset_index()
    lk_path = os.path.join(BACKEND_DIR, 'data', 'last_known_values.csv')
    os.makedirs(os.path.dirname(lk_path), exist_ok=True)
    last_known.to_csv(lk_path, index=False)
    print(f'  Last known values: {lk_path}')

    # ── save metadata ────────────────────────────────────────────────
    all_regions = sorted(df['region'].unique().tolist())

    metadata = {
        'regions': all_regions,
        'indicators': INDICATORS,
        'indicator_labels': {
            'population': 'Population',
            'employment_rate': 'Employment Rate (%)',
            'average_house_price': 'Average House Price (£)',
            'rental_index': 'Rental Price Index',
            'housing_completions': 'Housing Completions',
        },
        'train_year_range': [int(train_df['year'].min()), int(train_df['year'].max())],
        'prediction_range': [2025, 2035],
        'feature_columns': FEATURE_COLS,
        'mape_target': 8.0,
        'model_type': winning_model_name,
        'avg_mape': round(best_avg_mape, 4),
        'trained_at': datetime.datetime.now().isoformat(),
    }

    # per-indicator scores for the winning model
    metadata['scores'] = {}
    for row in results_table:
        if row['model'] == winning_model_name:
            metadata['scores'][row['indicator']] = {
                'mape': row['MAPE (%)'],
                'rmse': row['RMSE'],
            }

    with open(META_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f'  Metadata: {META_PATH}')

    # ── print the full results table ─────────────────────────────────
    print()
    print('=== Full Results Table ===')
    results_df = pd.DataFrame(results_table)
    print(results_df.to_string(index=False))

    print()
    print('Training complete.')


if __name__ == '__main__':
    train_and_evaluate()
