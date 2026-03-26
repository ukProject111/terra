# Key Project Information

## Project
- Title: AI-Powered UK Regional City & Insight Web Application
- Student: Bera Aksoy, T0407452
- University: Nottingham Trent University
- Timeline: Nov 2025 – Jun 2026


## Model Results

Trained all three models, compared on test set (2020-2023 data):

| Indicator            | Linear Reg | Random Forest | Gradient Boosting |
|----------------------|:----------:|:-------------:|:-----------------:|
| Population           | 0.16%      | 1.99%         | 1.20%             |
| Employment Rate      | 0.11%      | 0.84%         | 0.53%             |
| Avg House Price      | 2.04%      | 4.82%         | 4.69%             |
| Rental Index         | 0.23%      | 4.48%         | 4.10%             |
| Housing Completions  | 6.52%      | 7.99%         | 5.82%             |
| **Average MAPE**     | **1.81%**  | **4.02%**     | **3.27%**         |

Winner: Linear Regression (1.81% avg MAPE)
Target was <= 8% — all three models pass.

LR winning over GB was unexpected — probably because the dataset is small
(~150 usable rows) and the relationships are fairly linear. GB and RF
tend to shine with larger datasets.


## Regions (9 English regions)
East Midlands, East of England, London, North East, North West,
South East, South West, West Midlands, Yorkshire and The Humber


## Indicators
1. Population
2. Employment Rate (%)
3. Average House Price (GBP)
4. Rental Price Index (2015=100)
5. Housing Completions (count)


## API Performance
- Target: < 1 second per /predict call
- Actual: ~0.17-0.22 seconds locally


## Data Licence
UK Open Government Licence v3.0
https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/


## Ethics
- Disclaimers on all pages saying predictions are estimates only
- Not intended as policy advice
- Model limitations documented honestly (housing completions
  has highest error at 6.5%)
