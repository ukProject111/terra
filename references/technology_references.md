# Technology References

## Python / ML

- **pandas** — data manipulation. https://pandas.pydata.org/
  McKinney (2010). Data Structures for Statistical Computing in Python.

- **NumPy** — numerical computing. https://numpy.org/
  Harris et al. (2020). Array programming with NumPy. Nature 585, 357-362.

- **scikit-learn** — ML models and evaluation. https://scikit-learn.org/
  Pedregosa et al. (2011). Scikit-learn: Machine Learning in Python. JMLR 12, 2825-2830.
  Used: LinearRegression, RandomForestRegressor, GradientBoostingRegressor, GridSearchCV

- **joblib** — saving/loading trained models. https://joblib.readthedocs.io/
  Picked this over pickle because it handles numpy arrays more efficiently.

- **matplotlib** + **seaborn** — plotting for EDA
  https://matplotlib.org/ / https://seaborn.pydata.org/

## Backend

- **FastAPI** — REST API framework. https://fastapi.tiangolo.com/
  Chose this over Flask because of the auto-generated /docs endpoint
  and built-in request validation.

- **uvicorn** — ASGI server. https://www.uvicorn.org/

## Frontend

- **React** — UI library. https://react.dev/

- **Recharts** — charting. https://recharts.org/
  Simpler than D3 for our use case. Had some issues with responsive
  sizing at first but ResponsiveContainer sorted it.

- **Axios** — HTTP client. https://axios-http.com/

- **Vite** — build tool / dev server. https://vite.dev/
  Much faster than create-react-app for dev builds.

- **TypeScript** — https://www.typescriptlang.org/

## Evaluation Metrics

- **MAPE** — Hyndman & Koehler (2006). Another look at measures of forecast accuracy.
  International Journal of Forecasting 22(4), 679-688.

- **RMSE** — Chai & Draxler (2014). Root mean square error or mean absolute error?
  Geoscientific Model Development 7, 1247-1250.

## Deployment

- **Render** — https://render.com/ (free tier for both backend and frontend)

## Tools

- VS Code, GitHub, Jupyter Notebook
