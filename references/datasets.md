# Datasets

All under the UK Open Government Licence v3.0
https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/


## ONS — Population Estimates
- Mid-year population estimates by region (England)
- https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates
- CSV download, 2001 onwards
- Used for: population indicator
- Note: some years have revised estimates that differ from initial release.
  We used the latest available revision for each year.


## ONS — Employment and Labour Market
- Regional employment rates, economic activity
- https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes
- Also cross-referenced with NOMIS (below)
- Used for: employment_rate indicator
- Note: quarterly data — we averaged to get annual figures


## HM Land Registry — UK House Price Index
- Average house prices by English region
- https://www.gov.uk/government/collections/uk-house-price-index-reports
- Monthly data, we took annual means
- Used for: average_house_price indicator
- Note: the monthly CSVs are large and the region names don't always
  match ONS naming. Spent a while on the mapping.


## ONS/VOA — Private Rental Index
- Index of Private Housing Rental Prices (IPHRP)
- https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/indexofprivatehousingrentalprices/previousReleases
- Used for: rental_index indicator
- Note: index uses 2015=100 as base, not actual pound values


## DLUHC — Housing Completions
- Live Table 253: permanent dwellings completed by region
- https://www.gov.uk/government/statistical-data-sets/live-tables-on-house-building
- Used for: housing_completions indicator
- Note: some years report by financial year (Apr-Mar) rather than
  calendar year. We used the start year of the financial year.


## NOMIS — Labour Market Statistics
- https://www.nomisweb.co.uk/
- Registration required for bulk downloads
- Used for: cross-referencing ONS employment data at LA level
- The query builder is at: https://www.nomisweb.co.uk/query/select/getdatasetbytheme.asp


## data.gov.uk
- https://www.data.gov.uk/
- Used for additional regional datasets and validation


## Attribution

This project uses data from the Office for National Statistics, HM Land Registry,
DLUHC, and NOMIS, licensed under the Open Government Licence v3.0.
Crown copyright and database right.
