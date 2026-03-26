import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiService } from "../services/land_price";
import { getIndicatorMeta, formatIndicatorValue } from "../utils/indicatorMeta";
import { useStaggerReveal } from "../hooks/useStaggerReveal";
import "../styles/commonPages.css";

type TimeSeriesRow = {
    region: string;
    year: number;
    value: number;
    forecast_value?: number;
    moving_average?: number;
    growth_yoy?: number;
};

type RegionStatRow = {
    region: string;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    count: number;
};

type CorrelationPair = {
    x: string;
    y: string;
    corr: number;
};

const SERIES_START_YEAR = 2023;

const toFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
};

const buildContinuousAnalyticsSeries = (
    rows: TimeSeriesRow[],
    selectedYear: number,
    selectedRegion: string,
    selectedYearPrediction?: number,
): TimeSeriesRow[] => {
    const startYear = Math.min(SERIES_START_YEAR, selectedYear);
    const historical = rows
        .filter((row) => row.region === selectedRegion)
        .sort((a, b) => a.year - b.year)
        .filter((row) => row.year >= startYear && row.year <= selectedYear);

    if (historical.length === 0) {
        return [];
    }

    const byYear = new Map<number, TimeSeriesRow>(historical.map((row) => [row.year, row]));
    const lastKnown = historical[historical.length - 1];
    const targetValue = selectedYearPrediction ?? lastKnown.value;

    const series: TimeSeriesRow[] = [];
    let carryValue = historical[0].value;

    for (let y = startYear; y <= selectedYear; y += 1) {
        const existing = byYear.get(y);
        if (existing) {
            carryValue = existing.value;
            const isLatestHistorical = y === lastKnown.year && y < selectedYear;
            series.push({
                ...existing,
                forecast_value: isLatestHistorical ? existing.value : undefined,
            });
            continue;
        }

        if (y <= lastKnown.year) {
            series.push({
                region: selectedRegion,
                year: y,
                value: carryValue,
                moving_average: undefined,
                growth_yoy: undefined,
                forecast_value: undefined,
            });
            continue;
        }

        const denominator = Math.max(selectedYear - lastKnown.year, 1);
        const ratio = (y - lastKnown.year) / denominator;
        const interpolated = lastKnown.value + ((targetValue - lastKnown.value) * Math.max(0, Math.min(1, ratio)));

        series.push({
            region: selectedRegion,
            year: y,
            value: interpolated,
            moving_average: undefined,
            growth_yoy: undefined,
            forecast_value: interpolated,
        });
    }

    return series;
};

const AnalyticsPage = () => {
    const analyticsRef = useRef<HTMLDivElement | null>(null);
    useStaggerReveal(analyticsRef, ".analytics-animate", 20);

    const [regions, setRegions] = useState<string[]>([]);
    const [indicatorOptions, setIndicatorOptions] = useState<Record<string, string>>({});
    const [predictionRange, setPredictionRange] = useState<[number, number]>([2025, 2035]);

    const [region, setRegion] = useState("");
    const [indicator, setIndicator] = useState("");
    const [insight, setInsight] = useState("");
    const [maWindow, setMaWindow] = useState<3 | 5>(3);
    const [year, setYear] = useState(2030);

    const [timeSeries, setTimeSeries] = useState<TimeSeriesRow[]>([]);
    const [outliers, setOutliers] = useState<Array<{ region: string; year: number; value: number }>>([]);
    const [topPairs, setTopPairs] = useState<CorrelationPair[]>([]);
    const [regionStats, setRegionStats] = useState<RegionStatRow[]>([]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [hasInitialData, setHasInitialData] = useState(false);

    const indicatorLabel = indicatorOptions[indicator] ?? "Indicator";
    const insightLabel = indicatorOptions[insight] ?? "Insight";
    const indicatorMeta = useMemo(() => getIndicatorMeta(indicator, indicatorLabel), [indicator, indicatorLabel]);
    const insightMeta = useMemo(() => getIndicatorMeta(insight, insightLabel), [insight, insightLabel]);

    const formatIndicator = (value: unknown) => formatIndicatorValue(value, indicatorMeta);
    const formatInsight = (value: unknown) => formatIndicatorValue(value, insightMeta);

    useEffect(() => {
        async function init() {
            try {
                setIsOptionsLoading(true);
                const [regionsResponse, indicatorsResponse, predictOptionsResponse] = await Promise.all([
                    apiService.getRegions(),
                    apiService.getIndicatorOptions(),
                    apiService.getPredictOptions(),
                ]);

                const safeRegions = Array.isArray(regionsResponse) ? regionsResponse : [];
                const safeIndicators = indicatorsResponse && typeof indicatorsResponse === "object"
                    ? indicatorsResponse as Record<string, string>
                    : {};

                const indicatorKeys = Object.keys(safeIndicators);
                const defaultRegion = safeRegions.includes("London") ? "London" : (safeRegions[0] ?? "");
                const defaultIndicator = indicatorKeys.includes("average_house_price") ? "average_house_price" : (indicatorKeys[0] ?? "");

                setRegions(safeRegions);
                setIndicatorOptions(safeIndicators);
                setRegion(defaultRegion);
                setIndicator(defaultIndicator);
                setInsight(defaultIndicator);

                if (predictOptionsResponse && typeof predictOptionsResponse === "object") {
                    const range = (predictOptionsResponse as Record<string, unknown>).prediction_range;
                    if (Array.isArray(range) && range.length === 2 && typeof range[0] === "number" && typeof range[1] === "number") {
                        setPredictionRange([range[0], range[1]]);
                        setYear(Math.min(Math.max(2030, range[0]), range[1]));
                    }
                }
            } catch (error) {
                console.error("Failed to initialize analytics page:", error);
            } finally {
                setIsOptionsLoading(false);
            }
        }

        void init();
    }, []);

    useEffect(() => {
        if (!indicator || !insight) {
            return;
        }

        async function loadAnalytics() {
            setLoading(true);
            try {
                const selectedIndicatorSet = Object.keys(indicatorOptions).slice(0, 5);
                const correlationIndicators = selectedIndicatorSet.length > 1
                    ? selectedIndicatorSet
                    : [indicator, insight].filter(Boolean);

                const [timeseriesResponse, predictionResponse, outliersResponse, correlationResponse, statsResponse] = await Promise.all([
                    apiService.getTimeSeries(indicator, region || undefined, maWindow),
                    region ? apiService.getPredictedPrice(region, indicator, year) : Promise.resolve(undefined),
                    apiService.getOutliers(indicator),
                    apiService.getCorrelation(correlationIndicators),
                    apiService.getRegionStats(insight),
                ]);

                const tsSource = timeseriesResponse && typeof timeseriesResponse === "object"
                    ? timeseriesResponse as Record<string, unknown>
                    : {};
                const tsRows = Array.isArray(tsSource.series) ? tsSource.series : [];

                const parsedSeries = tsRows
                    .map((row) => {
                        if (!row || typeof row !== "object") {
                            return null;
                        }
                        const entry = row as Record<string, unknown>;
                        const parsedYear = Number(entry.year);
                        const parsedValue = Number(entry.value);
                        const parsedMa = entry.moving_average !== undefined ? Number(entry.moving_average) : undefined;
                        const parsedGrowth = entry.growth_yoy !== undefined ? Number(entry.growth_yoy) : undefined;

                        if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedValue)) {
                            return null;
                        }

                        const parsedRow: TimeSeriesRow = {
                            region: String(entry.region ?? "Unknown"),
                            year: parsedYear,
                            value: parsedValue,
                            moving_average: Number.isFinite(parsedMa ?? Number.NaN) ? parsedMa : undefined,
                            growth_yoy: Number.isFinite(parsedGrowth ?? Number.NaN) ? parsedGrowth : undefined,
                        };

                        return parsedRow;
                    })
                    .filter((row): row is TimeSeriesRow => row !== null)
                    .sort((a, b) => a.year - b.year)
                    .filter((row) => row.year <= year);

                const predictedForSelectedYear = predictionResponse && typeof predictionResponse === "object"
                    ? toFiniteNumber((predictionResponse as Record<string, unknown>).value)
                        ?? toFiniteNumber((predictionResponse as Record<string, unknown>).prediction)
                        ?? toFiniteNumber((predictionResponse as Record<string, unknown>).predicted_value)
                    : undefined;

                if (region) {
                    const extendedSeries = buildContinuousAnalyticsSeries(parsedSeries, year, region, predictedForSelectedYear);
                    setTimeSeries(extendedSeries.length > 0 ? extendedSeries : parsedSeries.filter((row) => row.region === region));
                } else {
                    setTimeSeries(parsedSeries);
                }

                const outlierSource = outliersResponse && typeof outliersResponse === "object"
                    ? outliersResponse as Record<string, unknown>
                    : {};
                const outlierRows = Array.isArray(outlierSource.outliers) ? outlierSource.outliers : [];
                const parsedOutliers = outlierRows
                    .map((row) => {
                        if (!row || typeof row !== "object") {
                            return null;
                        }
                        const entry = row as Record<string, unknown>;
                        const parsedYear = Number(entry.year);
                        const parsedValue = Number(entry.value);
                        if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedValue)) {
                            return null;
                        }
                        return {
                            region: String(entry.region ?? "Unknown"),
                            year: parsedYear,
                            value: parsedValue,
                        };
                    })
                    .filter((row): row is { region: string; year: number; value: number } => row !== null)
                    .filter((row) => row.year <= year)
                    .slice(0, 20);

                setOutliers(parsedOutliers);

                const correlationSource = correlationResponse && typeof correlationResponse === "object"
                    ? correlationResponse as Record<string, unknown>
                    : {};
                const pairRows = Array.isArray(correlationSource.top_pairs) ? correlationSource.top_pairs : [];
                const parsedPairs = pairRows
                    .map((row) => {
                        if (!row || typeof row !== "object") {
                            return null;
                        }
                        const entry = row as Record<string, unknown>;
                        const corr = Number(entry.corr);
                        if (!Number.isFinite(corr)) {
                            return null;
                        }
                        return {
                            x: String(entry.x ?? ""),
                            y: String(entry.y ?? ""),
                            corr,
                        };
                    })
                    .filter((row): row is CorrelationPair => row !== null)
                    .slice(0, 8);

                setTopPairs(parsedPairs);

                const statsSource = statsResponse && typeof statsResponse === "object"
                    ? statsResponse as Record<string, unknown>
                    : {};
                const statsObject = statsSource.stats && typeof statsSource.stats === "object"
                    ? statsSource.stats as Record<string, unknown>
                    : {};
                const statsRows = Array.isArray(statsObject[insight]) ? statsObject[insight] : [];
                const parsedStats = statsRows
                    .map((row) => {
                        if (!row || typeof row !== "object") {
                            return null;
                        }
                        const entry = row as Record<string, unknown>;
                        const mean = Number(entry.mean);
                        const median = Number(entry.median);
                        const std = Number(entry.std);
                        const min = Number(entry.min);
                        const max = Number(entry.max);
                        const count = Number(entry.count);

                        if (!Number.isFinite(mean) || !Number.isFinite(median)) {
                            return null;
                        }

                        return {
                            region: String(entry.region ?? "Unknown"),
                            mean,
                            median,
                            std: Number.isFinite(std) ? std : 0,
                            min: Number.isFinite(min) ? min : 0,
                            max: Number.isFinite(max) ? max : 0,
                            count: Number.isFinite(count) ? count : 0,
                        };
                    })
                    .filter((row): row is RegionStatRow => row !== null)
                    .slice(0, 12);

                setRegionStats(parsedStats);
            } catch (error) {
                console.error("Failed to load analytics data:", error);
            } finally {
                setLoading(false);
                setHasInitialData(true);
            }
        }

        void loadAnalytics();
    }, [indicator, indicatorOptions, insight, maWindow, region, year]);

    if (isOptionsLoading || (!hasInitialData && loading)) {
        return (
            <div className="predict-page">
                <div className="panel route-loader" role="status" aria-live="polite">
                    <div className="loading-spinner" />
                    <span>Loading analytics data...</span>
                </div>
            </div>
        );
    }

    return (
        <div ref={analyticsRef} className="predict-page">
            <div className="dashboard-disclaimer analytics-animate">
                Disclaimer: Projections are estimates based on historical data. For educational use only. Not a policy recommendation tool.
            </div>
            <header className="predict-header analytics-animate">
                <h1>Analytics Workspace</h1>
                <p>Explore trend, outliers, correlation, and regional stats for selected indicator/region/year.</p>
            </header>

            <section className="predict-control-row analytics-animate">
                <label title="Select the region you want to analyze.">
                    Region
                    <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        title="Choose a region to filter all analytics panels."
                    >
                        {regions.map((item) => (
                            <option key={item} value={item}>{item}</option>
                        ))}
                    </select>
                </label>
                <label title="Choose the main indicator for trend and outlier analysis.">
                    Indicator
                    <select
                        value={indicator}
                        onChange={(e) => setIndicator(e.target.value)}
                        title="Select an indicator to plot time series and outliers."
                    >
                        {Object.entries(indicatorOptions).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </label>
                <label title="Choose the indicator used in regional statistics.">
                    Insight
                    <select
                        value={insight}
                        onChange={(e) => setInsight(e.target.value)}
                        title="Select an indicator for region-level mean and median stats."
                    >
                        {Object.entries(indicatorOptions).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </label>
                <label title="Set moving average smoothing window size.">
                    MA Window
                    <select
                        value={maWindow}
                        onChange={(e) => setMaWindow(Number(e.target.value) as 3 | 5)}
                        title="Use 3 or 5 years to smooth the time series moving average."
                    >
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                    </select>
                </label>
                <label title="Pick the target year used for forecast extension.">
                    Year
                    <input
                        type="number"
                        min={predictionRange[0]}
                        max={predictionRange[1]}
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        title="Choose a year within the supported prediction range."
                    />
                </label>
                <button
                    type="button"
                    disabled={loading}
                    title="Data updates automatically when filters change."
                >
                    {loading ? "Refreshing..." : "Live"}
                </button>
            </section>

            <section className="analytics-grid">
                <article className="panel chart-span analytics-animate" title="Historical and forecast trend for the selected region and indicator.">
                    <h2>{indicatorLabel} Time Series</h2>
                    <p className="panel-subtitle">GET /analytics/timeseries?indicator={indicator}&amp;region={region}&amp;ma_window={maWindow}</p>
                    <div className="chart-wrap" title="Line chart showing raw values, moving average, and forecast continuation.">
                        {loading ? (
                            <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing time series...</span></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={timeSeries}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d2dbe6" />
                                    <XAxis dataKey="year" />
                                    <YAxis />
                                    <Tooltip formatter={formatIndicator} />
                                    <Legend />
                                    <Line dataKey="value" name={indicatorLabel} stroke="#1a6f8e" strokeWidth={2.3} dot={false} />
                                    <Line dataKey="moving_average" name={`MA (${maWindow})`} stroke="#6eaec8" strokeWidth={2.1} dot={false} strokeDasharray="5 5" />
                                    <Line dataKey="forecast_value" name="Forecast" stroke="#2a6f97" strokeWidth={2.1} dot={false} strokeDasharray="6 6" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                <article className="panel analytics-animate" title="Strongest positive and negative correlations among selected indicators.">
                    <h2>Top Correlations</h2>
                    <p className="panel-subtitle">GET /analytics/correlation</p>
                    <div className="chart-wrap compact" title="Bar chart of the top correlation coefficient pairs.">
                        {loading ? (
                            <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing correlations...</span></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={topPairs.map((row) => ({ pair: `${row.x} ~ ${row.y}`, corr: row.corr }))}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d2dbe6" />
                                    <XAxis dataKey="pair" hide />
                                    <YAxis domain={[-1, 1]} />
                                    <Tooltip formatter={(value: unknown) => typeof value === "number" ? value.toFixed(4) : "-"} />
                                    <Bar dataKey="corr" fill="#2c89a9" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                <article className="panel chart-span analytics-animate" title="Regional distribution summary for the selected insight indicator.">
                    <h2>{insightLabel} Region Stats</h2>
                    <p className="panel-subtitle">GET /analytics/stats/regions?indicator={insight}</p>
                    <div className="chart-wrap" title="Mean and median comparison across regions.">
                        {loading ? (
                            <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing region stats...</span></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={regionStats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d2dbe6" />
                                    <XAxis dataKey="region" />
                                    <YAxis />
                                    <Tooltip formatter={formatInsight} />
                                    <Legend />
                                    <Bar dataKey="mean" name="Mean" fill="#1a6f8e" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="median" name="Median" fill="#6eaec8" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                <article className="panel analytics-animate" title="Outlier rows detected for the selected indicator.">
                    <h2>Outliers</h2>
                    <p className="panel-subtitle">GET /analytics/outliers?indicator={indicator}</p>
                    <div className="analytics-table-wrap" title="Tabular outliers with region, year, and value.">
                        <table className="analytics-table" title="Detected outliers table">
                            <thead>
                                <tr>
                                    <th title="Region where the outlier was observed.">Region</th>
                                    <th title="Year in which the outlier value occurred.">Year</th>
                                    <th title="Formatted indicator value flagged as outlier.">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={3}>
                                            <div className="loading-inline" />
                                        </td>
                                    </tr>
                                ) : outliers.length === 0 ? (
                                    <tr>
                                        <td colSpan={3}>No outliers for selected filters.</td>
                                    </tr>
                                ) : (
                                    outliers.map((row, idx) => (
                                        <tr key={`${row.region}-${row.year}-${idx}`}>
                                            <td>{row.region}</td>
                                            <td>{row.year}</td>
                                            <td>{formatIndicator(row.value)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>
            </section>
        </div>
    );
};

export default AnalyticsPage;
