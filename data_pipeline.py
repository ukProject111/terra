# data_pipeline.py
# reads raw government CSVs from data/raw/, cleans and standardises them,
# merges everything into one master_dataset.csv for the ML step.
#
# data sources (all under UK OGL):
#   ONS — population, employment
#   DLUHC — housing completions
#   HM Land Registry — house prices
#   VOA/ONS — rental index
#
# usage: python data_pipeline.py

import os
import sys
import pandas as pd
import numpy as np

# ── paths ────────────────────────────────────────────────────────────
RAW_DIR       = os.path.join(os.path.dirname(__file__), 'data', 'raw')
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), 'data', 'processed')

# the final output
OUTPUT_PATH = os.path.join(PROCESSED_DIR, 'master_dataset.csv')

# ── region mapping ───────────────────────────────────────────────────
# government datasets use wildly inconsistent region names, so we map
# everything to one canonical set. this bit alone took almost a week
# to get right because ONS uses 9 regions but DLUHC sometimes has 10

REGION_ALIASES = {
    'east midlands':               'East Midlands',
    'east_midlands':               'East Midlands',
    'e midlands':                  'East Midlands',
    'east of england':             'East of England',
    'east':                        'East of England',
    'eastern':                     'East of England',
    'london':                      'London',
    'greater london':              'London',
    'north east':                  'North East',
    'north_east':                  'North East',
    'north east england':          'North East',
    'north west':                  'North West',
    'north_west':                  'North West',
    'north west england':          'North West',
    'south east':                  'South East',
    'south_east':                  'South East',
    'south east england':          'South East',
    'south west':                  'South West',
    'south_west':                  'South West',
    'west midlands':               'West Midlands',
    'west_midlands':               'West Midlands',
    'w midlands':                  'West Midlands',
    'yorkshire and the humber':    'Yorkshire and The Humber',
    'yorkshire & the humber':      'Yorkshire and The Humber',
    'yorkshire':                   'Yorkshire and The Humber',
    'yorks and humber':            'Yorkshire and The Humber',
    'yorkshire_and_the_humber':    'Yorkshire and The Humber',
}

CANONICAL_REGIONS = sorted(set(REGION_ALIASES.values()))

INDICATORS = [
    'population',
    'employment_rate',
    'average_house_price',
    'rental_index',
    'housing_completions',
]


def standardise_region(name):
    """Map any known alias to the canonical region name."""
    if pd.isna(name):
        return None
    cleaned = str(name).strip().lower()
    return REGION_ALIASES.get(cleaned, None)


def clean_columns(df):
    """Lowercase column names, replace spaces with underscores."""
    df.columns = (
        df.columns
          .str.strip()
          .str.lower()
          .str.replace(' ', '_', regex=False)
          .str.replace('-', '_', regex=False)
    )
    return df


# ── individual loaders ───────────────────────────────────────────────
# each function reads one raw CSV and returns a tidy dataframe with
# columns: region, year, <indicator>

def load_population():
    """ONS mid-year population estimates."""
    path = os.path.join(RAW_DIR, 'ons_population.csv')
    if not os.path.exists(path):
        print(f'  [skip] {path} not found')
        return pd.DataFrame()

    df = pd.read_csv(path)
    df = clean_columns(df)

    # ons sometimes puts the year in a 'period' or 'time' column
    if 'year' not in df.columns:
        for col in ['period', 'time', 'date']:
            if col in df.columns:
                df['year'] = pd.to_numeric(df[col], errors='coerce')
                break

    # map region
    region_col = None
    for col in ['region', 'geography', 'area', 'area_name']:
        if col in df.columns:
            region_col = col
            break

    if region_col is None:
        print('  [warn] no region column in population csv')
        return pd.DataFrame()

    df['region'] = df[region_col].apply(standardise_region)
    df = df.dropna(subset=['region', 'year'])
    df['year'] = df['year'].astype(int)

    # find the population value column
    pop_col = None
    for col in ['population', 'mid_year_estimate', 'value', 'count', 'all_ages']:
        if col in df.columns:
            pop_col = col
            break

    if pop_col is None:
        print('  [warn] no population value column found')
        return pd.DataFrame()

    df['population'] = pd.to_numeric(df[pop_col], errors='coerce')
    return df[['region', 'year', 'population']].dropna()


def load_employment():
    """ONS / NOMIS employment rate by region."""
    path = os.path.join(RAW_DIR, 'ons_employment.csv')
    if not os.path.exists(path):
        print(f'  [skip] {path} not found')
        return pd.DataFrame()

    df = pd.read_csv(path)
    df = clean_columns(df)

    if 'year' not in df.columns:
        for col in ['period', 'time', 'date']:
            if col in df.columns:
                df['year'] = pd.to_numeric(df[col], errors='coerce')
                break

    region_col = next((c for c in ['region', 'geography', 'area', 'area_name']
                       if c in df.columns), None)
    if region_col is None:
        return pd.DataFrame()

    df['region'] = df[region_col].apply(standardise_region)
    df = df.dropna(subset=['region', 'year'])
    df['year'] = df['year'].astype(int)

    emp_col = next((c for c in ['employment_rate', 'rate', 'value', 'emp_rate']
                    if c in df.columns), None)
    if emp_col is None:
        return pd.DataFrame()

    df['employment_rate'] = pd.to_numeric(df[emp_col], errors='coerce')
    return df[['region', 'year', 'employment_rate']].dropna()


def load_house_prices():
    """HM Land Registry average house prices."""
    path = os.path.join(RAW_DIR, 'hm_land_registry_prices.csv')
    if not os.path.exists(path):
        print(f'  [skip] {path} not found')
        return pd.DataFrame()

    df = pd.read_csv(path)
    df = clean_columns(df)

    if 'year' not in df.columns:
        for col in ['period', 'date', 'time']:
            if col in df.columns:
                df['year'] = pd.to_numeric(
                    df[col].astype(str).str[:4], errors='coerce'
                )
                break

    region_col = next((c for c in ['region', 'area', 'region_name']
                       if c in df.columns), None)
    if region_col is None:
        return pd.DataFrame()

    df['region'] = df[region_col].apply(standardise_region)
    df = df.dropna(subset=['region', 'year'])
    df['year'] = df['year'].astype(int)

    price_col = next((c for c in ['average_house_price', 'average_price',
                                   'price', 'value', 'avg_price']
                      if c in df.columns), None)
    if price_col is None:
        return pd.DataFrame()

    df['average_house_price'] = pd.to_numeric(df[price_col], errors='coerce')

    # some monthly data — take annual mean per region
    grouped = (df.groupby(['region', 'year'])['average_house_price']
                 .mean().reset_index())
    return grouped


def load_rental_index():
    """ONS / VOA private rental index."""
    path = os.path.join(RAW_DIR, 'ons_rental_index.csv')
    if not os.path.exists(path):
        print(f'  [skip] {path} not found')
        return pd.DataFrame()

    df = pd.read_csv(path)
    df = clean_columns(df)

    if 'year' not in df.columns:
        for col in ['period', 'time', 'date']:
            if col in df.columns:
                df['year'] = pd.to_numeric(df[col], errors='coerce')
                break

    region_col = next((c for c in ['region', 'area', 'geography']
                       if c in df.columns), None)
    if region_col is None:
        return pd.DataFrame()

    df['region'] = df[region_col].apply(standardise_region)
    df = df.dropna(subset=['region', 'year'])
    df['year'] = df['year'].astype(int)

    idx_col = next((c for c in ['rental_index', 'index', 'value']
                    if c in df.columns), None)
    if idx_col is None:
        return pd.DataFrame()

    df['rental_index'] = pd.to_numeric(df[idx_col], errors='coerce')
    grouped = df.groupby(['region', 'year'])['rental_index'].mean().reset_index()
    return grouped


def load_housing_completions():
    """DLUHC housing completions by region."""
    path = os.path.join(RAW_DIR, 'dluhc_housing_completions.csv')
    if not os.path.exists(path):
        print(f'  [skip] {path} not found')
        return pd.DataFrame()

    df = pd.read_csv(path)
    df = clean_columns(df)

    if 'year' not in df.columns:
        for col in ['period', 'financial_year', 'time']:
            if col in df.columns:
                df['year'] = pd.to_numeric(
                    df[col].astype(str).str[:4], errors='coerce'
                )
                break

    region_col = next((c for c in ['region', 'area', 'geography']
                       if c in df.columns), None)
    if region_col is None:
        return pd.DataFrame()

    df['region'] = df[region_col].apply(standardise_region)
    df = df.dropna(subset=['region', 'year'])
    df['year'] = df['year'].astype(int)

    comp_col = next((c for c in ['housing_completions', 'completions',
                                  'total_completions', 'value']
                     if c in df.columns), None)
    if comp_col is None:
        return pd.DataFrame()

    df['housing_completions'] = pd.to_numeric(df[comp_col], errors='coerce')
    return df[['region', 'year', 'housing_completions']].dropna()


# ── feature engineering ──────────────────────────────────────────────

def add_growth_rates(df):
    """Year-on-year percentage growth for each indicator."""
    df = df.sort_values(['region', 'year']).copy()
    for col in INDICATORS:
        if col not in df.columns:
            continue
        growth_col = f'{col}_growth_rate'
        df[growth_col] = (
            df.groupby('region')[col]
              .pct_change() * 100.0
        )
    return df


def add_lag_features(df):
    """Lag-1 and lag-2 values for each indicator (needed by the model)."""
    df = df.sort_values(['region', 'year']).copy()
    for col in INDICATORS:
        if col not in df.columns:
            continue
        grp = df.groupby('region')[col]
        df[f'{col}_lag1'] = grp.shift(1)
        df[f'{col}_lag2'] = grp.shift(2)
    return df


def add_population_change(df):
    """Absolute population change year over year."""
    if 'population' not in df.columns:
        return df
    df = df.sort_values(['region', 'year']).copy()
    df['population_change'] = df.groupby('region')['population'].diff()
    return df


# ── main pipeline ────────────────────────────────────────────────────

def run_pipeline():
    print('=== UK Regional Data Pipeline ===')
    print()

    os.makedirs(PROCESSED_DIR, exist_ok=True)

    # check if raw files exist
    raw_files = os.listdir(RAW_DIR) if os.path.exists(RAW_DIR) else []
    csv_files = [f for f in raw_files if f.endswith('.csv')]

    if len(csv_files) == 0:
        print('[info] No raw CSVs found in data/raw/.')
        print('       If the processed dataset already exists we can skip this step.')

        if os.path.exists(OUTPUT_PATH):
            print(f'       Found existing {OUTPUT_PATH} — loading that instead.')
            df = pd.read_csv(OUTPUT_PATH)
            print(f'       Shape: {df.shape}')
            print(f'       Regions: {sorted(df["region"].unique())}')
            print('       Pipeline done (using existing processed data).')
            return df
        else:
            print('[error] No raw data and no processed data. Nothing to do.')
            sys.exit(1)

    # load each source
    print('Loading raw datasets...')
    frames = {
        'population':          load_population(),
        'employment':          load_employment(),
        'house_prices':        load_house_prices(),
        'rental_index':        load_rental_index(),
        'housing_completions': load_housing_completions(),
    }

    for name, frame in frames.items():
        if frame.empty:
            print(f'  {name}: empty (file missing or could not parse)')
        else:
            print(f'  {name}: {len(frame)} rows, years {frame["year"].min()}-{frame["year"].max()}')

    # merge everything on [region, year]
    print()
    print('Merging datasets...')

    merged = None
    for name, frame in frames.items():
        if frame.empty:
            continue
        if merged is None:
            merged = frame
        else:
            merged = pd.merge(merged, frame, on=['region', 'year'], how='outer')

    if merged is None or merged.empty:
        print('[error] Nothing to merge — check your raw files')
        sys.exit(1)

    # only keep our canonical regions
    merged = merged[merged['region'].isin(CANONICAL_REGIONS)].copy()
    merged = merged.sort_values(['region', 'year']).reset_index(drop=True)

    print(f'  Merged shape: {merged.shape}')
    print(f'  Regions: {sorted(merged["region"].unique())}')
    print(f'  Year range: {merged["year"].min()} - {merged["year"].max()}')

    # handle missing values
    print()
    print('Handling missing values...')
    before_na = merged.isna().sum().sum()

    # forward fill within each region, then interpolate any remaining gaps
    merged = merged.sort_values(['region', 'year'])
    for col in INDICATORS:
        if col not in merged.columns:
            continue
        merged[col] = merged.groupby('region')[col].transform(
            lambda s: s.ffill().interpolate(method='linear')
        )

    after_na = merged.isna().sum().sum()
    print(f'  NaN count: {before_na} -> {after_na}')

    # feature engineering
    print()
    print('Adding engineered features...')
    merged = add_growth_rates(merged)
    merged = add_lag_features(merged)
    merged = add_population_change(merged)

    # drop rows where lags are NaN (first 2 years per region)
    before_drop = len(merged)
    merged = merged.dropna(subset=[f'{INDICATORS[0]}_lag1']).copy()
    print(f'  Dropped {before_drop - len(merged)} rows without lag values')

    # save
    merged = merged.round(4)
    merged.to_csv(OUTPUT_PATH, index=False)
    print()
    print(f'Saved: {OUTPUT_PATH}')
    print(f'Final shape: {merged.shape}')
    print('Pipeline done.')

    return merged


if __name__ == '__main__':
    run_pipeline()
