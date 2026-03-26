import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiService } from "../services/land_price";
import { getIndicatorMeta, formatIndicatorValue } from "../utils/indicatorMeta";
import { toNum, unwrapArray, parseTimeSeries, buildLine } from "../utils/chartHelpers";
import { useStaggerReveal } from "../hooks/useStaggerReveal";
import "../styles/commonPages.css";

type ForecastRow = { year: number; actual: number | null; prediction: number | null };
type CompareRow = { year: number; region1Val: number; region2Val: number };
type HeatmapRow = { region: string; value: number };
type Metrics = { mae: number; avgRae: number; r2: number; mse: number };

// start the chart from this year so we don't show ancient data
const SERIES_START_YEAR = 2023;

// no fake placeholder data — everything comes from the API.
// empty arrays shown behind the loading spinner until real data arrives.

// parse the region stats response into heatmap-friendly shape
const normalizeRegionStats = (payload: unknown): HeatmapRow[] => {
    let rows = unwrapArray(payload);
    // backend may return: { stats: { indicator_name: [...] } }
    if (rows.length === 0 && payload && typeof payload === "object") {
        const stats = (payload as Record<string, unknown>).stats;
        if (stats && typeof stats === "object") {
            const first = Object.values(stats as Record<string, unknown>).find(Array.isArray);
            if (Array.isArray(first)) {
                rows = first;
            }
        }
    }
    return rows.map(entry => {
        if (!entry || typeof entry !== 'object') return null;
        const r = entry as Record<string, unknown>;
        const region = r.region ?? r.name ?? r.area;
        const value = toNum(r.value) ?? toNum(r.mean) ?? toNum(r.avg)
            ?? toNum(r.median) ?? toNum(r.latest);
        if (typeof region !== 'string' || value === undefined) return null;
        return { region, value: Math.round(value) };
    }).filter((r): r is HeatmapRow => r !== null).slice(0, 8);
};

// turn known historical series + a prediction into chart rows
const makeForecastRows = (
    known: Array<{year: number; value: number}>,
    targetYear: number,
    targetValue: number,
): ForecastRow[] => {
    const line = buildLine(known, targetYear, targetValue);
    const lastHistorical = known.filter(r => r.year <= targetYear)
        .sort((a, b) => a.year - b.year).pop()?.year ?? SERIES_START_YEAR;

    return line.map(pt => ({
        year: pt.year,
        actual: pt.year <= lastHistorical ? pt.value : null,
        prediction: pt.year >= lastHistorical ? pt.value : null,
    }));
};

const HomePage = () => {
    const pageRef = useRef<HTMLDivElement | null>(null);
    const [regions, setRegions] = useState<string[]>([]);
    const [indicatorOptions, setIndicatorOptions] = useState<Record<string, string>>({});
    const [selectedRegion, setSelectedRegion] = useState("London");
    const [compareRegion, setCompareRegion] = useState("East Midlands");
    const [selectedIndicator, setSelectedIndicator] = useState("average_house_price");
    const [selectedInsight, setSelectedInsight] = useState("average_house_price");
    const [selectedYear, setSelectedYear] = useState(2030);
    const [predictionRange, setPredictionRange] = useState<[number, number]>([2025, 2035]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [hasInitialData, setHasInitialData] = useState(false);
    const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
    const [compareData, setCompareData] = useState<CompareRow[]>([]);
    const [heatmapData, setHeatmapData] = useState<HeatmapRow[]>([]);
    const [forecastValue, setForecastValue] = useState(0);
    const [forecastInsight, setForecastInsight] = useState("");
    const [compareInsight, setCompareInsight] = useState("");
    const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 0]);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const selectedIndicatorLabel = indicatorOptions[selectedIndicator] ?? "Indicator";
    const selectedInsightLabel = indicatorOptions[selectedInsight] ?? "Insight";
    const selectedIndicatorMeta = useMemo(
        () => getIndicatorMeta(selectedIndicator, selectedIndicatorLabel),
        [selectedIndicator, selectedIndicatorLabel],
    );
    const selectedInsightMeta = useMemo(
        () => getIndicatorMeta(selectedInsight, selectedInsightLabel),
        [selectedInsight, selectedInsightLabel],
    );
    const formatSelectedIndicator = (value: unknown) => formatIndicatorValue(value, selectedIndicatorMeta);
    const formatSelectedInsight = (value: unknown) => formatIndicatorValue(value, selectedInsightMeta);

    useEffect(() => {
        async function loadOptions() {
            try {
                setIsOptionsLoading(true);
                const [regionsResponse, indicatorsResponse] = await Promise.all([
                    apiService.getRegions(),
                    apiService.getIndicatorOptions(),
                ]);

                const safeRegions = Array.isArray(regionsResponse) ? regionsResponse : [];
                const safeIndicators = indicatorsResponse && typeof indicatorsResponse === "object"
                    ? indicatorsResponse as Record<string, string>
                    : {};

                setRegions(safeRegions);
                setIndicatorOptions(safeIndicators);

                const indicatorKeys = Object.keys(safeIndicators);
                const preferredRegion = safeRegions.includes("London") ? "London" : (safeRegions[0] ?? "London");
                const preferredCompareRegion = safeRegions.find((region) => region !== preferredRegion) ?? preferredRegion;
                const preferredIndicator = indicatorKeys.includes("average_house_price") ? "average_house_price" : (indicatorKeys[0] ?? "average_house_price");

                const [predictOptionsResponse, modelInfoResponse] = await Promise.all([
                    apiService.getPredictOptions(),
                    apiService.getModelInfo(),
                ]);
                if (predictOptionsResponse && typeof predictOptionsResponse === "object") {
                    const pr = (predictOptionsResponse as Record<string, unknown>).prediction_range;
                    if (Array.isArray(pr) && pr.length === 2 && typeof pr[0] === "number" && typeof pr[1] === "number") {
                        setPredictionRange([pr[0], pr[1]]);
                        setSelectedYear(Math.min(Math.max(2030, pr[0]), pr[1]));
                    }
                }

                // load real model accuracy scores
                if (modelInfoResponse && typeof modelInfoResponse === "object") {
                    const info = modelInfoResponse as Record<string, unknown>;
                    const avgMape = toNum(info.avg_mape);
                    if (avgMape !== undefined) {
                        setMetrics({ mae: avgMape / 100, avgRae: avgMape / 100, r2: 0, mse: 0 });
                    }
                    // try to get per-indicator scores
                    const scores = info.scores as Record<string, Record<string, unknown>> | undefined;
                    if (scores) {
                        const allMapes = Object.values(scores).map(s => toNum(s.mape)).filter((v): v is number => v !== undefined);
                        const allRmses = Object.values(scores).map(s => toNum(s.rmse)).filter((v): v is number => v !== undefined);
                        const avgRmse = allRmses.length > 0 ? allRmses.reduce((a, b) => a + b, 0) / allRmses.length : 0;
                        if (allMapes.length > 0) {
                            const mean = allMapes.reduce((a, b) => a + b, 0) / allMapes.length;
                            setMetrics({
                                mae: mean,
                                avgRae: avgMape ?? mean,
                                r2: 1 - (mean / 100),
                                mse: avgRmse,
                            });
                        }
                    }
                }

                setSelectedRegion(preferredRegion);
                setCompareRegion(preferredCompareRegion);
                setSelectedIndicator(preferredIndicator);
                setSelectedInsight(preferredIndicator);
            } catch (error) {
                console.error("Error loading dashboard options:", error);
            } finally {
                setIsOptionsLoading(false);
            }
        }

        void loadOptions();
    }, []);

    useEffect(() => {
        if (!selectedRegion || !selectedIndicator || !selectedInsight || !compareRegion) {
            return;
        }

        async function loadDashboardData() {
            setIsLoading(true);
            try {
                const [selectedSeriesResponse, compareSeriesResponse, regionStatsResponse, predictionResponse, comparisonResponse] = await Promise.all([
                    apiService.getTimeSeries(selectedIndicator, selectedRegion),
                    apiService.getTimeSeries(selectedIndicator, compareRegion),
                    apiService.getRegionStats(selectedInsight),
                    apiService.getPredictedPrice(selectedRegion, selectedIndicator, selectedYear),
                    apiService.compareRegions(selectedRegion, compareRegion, selectedIndicator, selectedYear),
                ]);

                const selectedSeries = parseTimeSeries(selectedSeriesResponse);
                const compareSeriesRaw = parseTimeSeries(compareSeriesResponse);
                const regionStats = normalizeRegionStats(regionStatsResponse);
                const prediction = predictionResponse && typeof predictionResponse === "object" ? predictionResponse as Record<string, unknown> : {};
                const comparison = comparisonResponse && typeof comparisonResponse === "object" ? comparisonResponse as Record<string, unknown> : {};

                if (regionStats.length >= 3) {
                    setHeatmapData(regionStats);
                }

                const predictedValue =
                    toNum(prediction.predicted_value) ??
                    toNum(prediction.prediction) ??
                    toNum(prediction.value) ??
                    forecastValue;

                setForecastValue(Math.round(predictedValue));

                if (typeof prediction.insight === "string") {
                    setForecastInsight(prediction.insight);
                }

                const confidenceInterval = Array.isArray(prediction.confidence_interval) ? prediction.confidence_interval : undefined;
                if (confidenceInterval && confidenceInterval.length === 2) {
                    const lower = toNum(confidenceInterval[0]);
                    const upper = toNum(confidenceInterval[1]);
                    if (lower !== undefined && upper !== undefined) {
                        setConfidenceRange([Math.round(lower), Math.round(upper)]);
                    }
                } else {
                    const lower = toNum(prediction.lower_bound);
                    const upper = toNum(prediction.upper_bound);
                    if (lower !== undefined && upper !== undefined) {
                        setConfidenceRange([Math.round(lower), Math.round(upper)]);
                    }
                }

                if (selectedSeries.length >= 1) {
                    const forecastRows = makeForecastRows(
                        selectedSeries,
                        selectedYear,
                        Math.round(predictedValue),
                    );
                    setForecastData(forecastRows);
                }

                if (typeof comparison.insight === "string") {
                    setCompareInsight(comparison.insight);
                }

                if (selectedSeries.length >= 1 && compareSeriesRaw.length >= 1) {
                    const region1Payload = comparison.region1 && typeof comparison.region1 === "object"
                        ? comparison.region1 as Record<string, unknown>
                        : {};
                    const region2Payload = comparison.region2 && typeof comparison.region2 === "object"
                        ? comparison.region2 as Record<string, unknown>
                        : {};
                    const region1Forecast = toNum(region1Payload.value) ?? selectedSeries[selectedSeries.length - 1]?.value ?? 0;
                    const region2Forecast = toNum(region2Payload.value) ?? compareSeriesRaw[compareSeriesRaw.length - 1]?.value ?? 0;

                    const region1Continuous = buildLine(selectedSeries, selectedYear, region1Forecast);
                    const region2Continuous = buildLine(compareSeriesRaw, selectedYear, region2Forecast);

                    const region1Map = new Map<number, number>(region1Continuous.map((row) => [row.year, row.value]));
                    const region2Map = new Map<number, number>(region2Continuous.map((row) => [row.year, row.value]));
                    const years = Array.from({ length: Math.max(selectedYear - SERIES_START_YEAR + 1, 1) }, (_, idx) => SERIES_START_YEAR + idx)
                        .filter((year) => year <= selectedYear);

                    const merged = years
                        .map((year) => {
                            const first = region1Map.get(year);
                            const second = region2Map.get(year);
                            if (first === undefined || second === undefined) {
                                return null;
                            }
                            return { year, region1Val: Math.round(first), region2Val: Math.round(second) };
                        })
                        .filter((row): row is CompareRow => row !== null);

                    if (merged.length >= 1) {
                        setCompareData(merged);
                    }
                }

                // metrics are loaded from /model/info in the options useEffect,
                // no need to extract them from prediction response
            } catch (error) {
                console.error("Error loading dashboard analytics:", error);
            } finally {
                setIsLoading(false);
                setHasInitialData(true);
            }
        }

        void loadDashboardData();
    }, [compareRegion, selectedIndicator, selectedInsight, selectedRegion, selectedYear]);

    const indicatorEntries = useMemo(() => Object.entries(indicatorOptions), [indicatorOptions]);
    const firstComparePoint = compareData[0];
    const lastComparePoint = compareData[compareData.length - 1];
    const region1Growth = firstComparePoint && lastComparePoint
        ? ((lastComparePoint.region1Val - firstComparePoint.region1Val) / Math.max(firstComparePoint.region1Val, 1)) * 100
        : 0;
    const region2Growth = firstComparePoint && lastComparePoint
        ? ((lastComparePoint.region2Val - firstComparePoint.region2Val) / Math.max(firstComparePoint.region2Val, 1)) * 100
        : 0;
    const forecastMomentum = forecastData.length > 0
        ? ((forecastValue - Math.max((forecastData[forecastData.length - 2]?.actual ?? forecastValue), 1)) / Math.max((forecastData[forecastData.length - 2]?.actual ?? forecastValue), 1)) * 100
        : 0;

    useStaggerReveal(pageRef, ".home-animate", 26);

    if (isOptionsLoading || (!hasInitialData && isLoading)) {
        return (
            <div className="predict-page">
                <div className="panel route-loader" role="status" aria-live="polite">
                    <div className="loading-spinner" />
                    <span>Loading dashboard data...</span>
                </div>
            </div>
        );
    }

    return (
        <div ref={pageRef} className="dashboard-page">
            <div className="dashboard-disclaimer home-animate">
                Disclaimer: All future values are AI-generated predictions based on historical data. Forecasts are indicative and not guaranteed valuations.
            </div>

            <header className="dashboard-topbar home-animate">
                <h1>Land-Price Prediction Dashboard</h1>
                <div className="topbar-controls">
                    <label>
                        Region
                        <select className="dashboard-select" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                            {regions.map((region) => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Compare With
                        <select className="dashboard-select" value={compareRegion} onChange={(e) => setCompareRegion(e.target.value)}>
                            {regions.map((region) => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Indicator
                        <select className="dashboard-select" value={selectedIndicator} onChange={(e) => setSelectedIndicator(e.target.value)}>
                            {indicatorEntries.map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Year
                        <input
                            className="dashboard-select"
                            type="number"
                            min={predictionRange[0]}
                            max={predictionRange[1]}
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                        />
                    </label>
                    <label>
                        Insight
                        <select className="dashboard-select" value={selectedInsight} onChange={(e) => setSelectedInsight(e.target.value)}>
                            {indicatorEntries.map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </label>
                    <div className="region-pill">{isLoading ? "Refreshing" : "Live"}</div>
                </div>
            </header>

            <section className="dashboard-grid">
                <article className="panel card-span-2 home-animate">
                    <div className="panel-header">
                        <h2>Forecast Overview</h2>
                        <span className="chip">Forecast</span>
                    </div>
                    <p className="panel-subtitle">GET /predict?region={selectedRegion}&amp;indicator={selectedIndicator}&amp;year={selectedYear}</p>

                    <div className="forecast-layout">
                        <div className="forecast-highlight">
                            <h3>{selectedRegion} {selectedIndicatorLabel} {selectedYear}</h3>
                            <p className="forecast-label">Predicted Value</p>
                            {isLoading ? <div className="loading-block" /> : <p className="forecast-price">{formatSelectedIndicator(forecastValue)}</p>}
                            {isLoading ? <div className="loading-inline" /> : (
                                <>
                                    <div className="confidence-band" aria-hidden="true">
                                        <span className="confidence-fill" />
                                    </div>
                                    <p className="confidence-text">95% CI: {formatSelectedIndicator(confidenceRange[0])} - {formatSelectedIndicator(confidenceRange[1])}</p>
                                </>
                            )}
                        </div>

                        <div className="chart-wrap">
                            {isLoading ? (
                                <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing forecast...</span></div>
                            ) : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={forecastData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#d0dae4" />
                                        <XAxis dataKey="year" allowDecimals={false} />
                                        <YAxis />
                                        <Tooltip formatter={formatSelectedIndicator} />
                                        <Area type="monotone" dataKey="actual" stroke="#0f4d68" fill="#8ec6df" fillOpacity={0.25} strokeWidth={2} />
                                        <Line type="monotone" dataKey="prediction" stroke="#2a6f97" strokeDasharray="6 6" strokeWidth={2.2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                    {forecastInsight && !isLoading ? (
                        <p className="insight-text">{forecastInsight}</p>
                    ) : null}
                </article>

                <article className="panel home-animate">
                    <div className="panel-header">
                        <h2>UK Heatmap</h2>
                    </div>
                    <p className="panel-subtitle">Regional signal intensity for {selectedInsightLabel}</p>
                    <div className="chart-wrap compact">
                        {isLoading ? (
                            <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing insights...</span></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={heatmapData} layout="vertical" margin={{ left: 14, right: 14 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d6dfe8" />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="region" width={92} tick={{ fontSize: 12 }} />
                                    <Tooltip formatter={formatSelectedInsight} />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#2b88a8" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                <article className="panel card-span-2 home-animate">
                    <div className="panel-header">
                        <h2>Side-by-Side Comparison</h2>
                        <span className="chip">{selectedIndicatorLabel} Trend</span>
                    </div>
                    <p className="panel-subtitle">GET /compare?region1={selectedRegion}&amp;region2={compareRegion}&amp;indicator={selectedIndicator}&amp;year={selectedYear}</p>
                    <div className="compare-layout">
                        <div className="compare-cards">
                            <div className="mini-stat">
                                <h4>Region 1: {selectedRegion}</h4>
                                {isLoading ? (
                                    <>
                                        <div className="loading-inline" />
                                        <div className="loading-inline" />
                                    </>
                                ) : (
                                    <>
                                        <p>Trend Growth <strong>{region1Growth >= 0 ? "+" : ""}{region1Growth.toFixed(1)}%</strong></p>
                                        <p>Forecast Momentum <strong>{forecastMomentum >= 0 ? "+" : ""}{forecastMomentum.toFixed(1)}%</strong></p>
                                    </>
                                )}
                            </div>
                            <div className="mini-stat alt">
                                <h4>Region 2: {compareRegion}</h4>
                                {isLoading ? (
                                    <>
                                        <div className="loading-inline" />
                                        <div className="loading-inline" />
                                    </>
                                ) : (
                                    <>
                                        <p>Trend Growth <strong>{region2Growth >= 0 ? "+" : ""}{region2Growth.toFixed(1)}%</strong></p>
                                        <p>Forecast Momentum <strong>{region2Growth >= 0 ? "+" : ""}{region2Growth.toFixed(1)}%</strong></p>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="chart-wrap">
                            {isLoading ? (
                                <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing comparison...</span></div>
                            ) : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={compareData}>
                                        <CartesianGrid strokeDasharray="4 4" stroke="#d1dbe6" />
                                        <XAxis dataKey="year" allowDecimals={false} />
                                        <YAxis />
                                        <Tooltip formatter={formatSelectedIndicator} />
                                        <Line dataKey="region1Val" name={selectedRegion} stroke="#0f4d68" strokeWidth={2.4} dot={false} />
                                        <Line dataKey="region2Val" name={compareRegion} stroke="#468faf" strokeWidth={2.4} dot={false} strokeDasharray="5 5" />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                    {compareInsight && !isLoading ? (
                        <p className="insight-text">{compareInsight}</p>
                    ) : null}
                </article>

                <article className="panel home-animate">
                    <div className="panel-header">
                        <h2>Model Accuracy</h2>
                    </div>
                    <div className="metric-list">
                        {isLoading || !metrics ? (
                            <>
                                <div className="loading-inline" />
                                <div className="loading-inline" />
                                <div className="loading-inline" />
                            </>
                        ) : (
                            <>
                                <p><span>Avg MAPE</span><strong>{metrics.mae.toFixed(4)}%</strong></p>
                                <p><span>Avg RMSE</span><strong>{metrics.mse.toFixed(2)}</strong></p>
                                <p><span>Model</span><strong>Linear Regression</strong></p>
                            </>
                        )}
                    </div>
                </article>
            </section>
        </div>
    );
};

export default HomePage;