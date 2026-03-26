import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {apiService} from "../services/land_price.tsx";
import { getIndicatorMeta, formatIndicatorValue } from "../utils/indicatorMeta";
import { useStaggerReveal } from "../hooks/useStaggerReveal";
import "../styles/commonPages.css"

const PredictionPage = () => {
    interface PredictionOptions {
        prediction_range?: number[];
    }
    interface DataObj {
        region: string;
        indicator: string;
        year: number;
    }
    interface HistoryPoint {
        year: number;
        value: number;
    }
    interface PredictionResponse {
        predicted_value?: number;
        prediction?: number;
        value?: number;
        lower_bound?: number;
        upper_bound?: number;
        confidence_interval?: [number, number];
        historical?: HistoryPoint[];
        forecast?: HistoryPoint[];
    }
    interface ChartPoint {
        year: number;
        actual: number | null;
        prediction: number | null;
    }

    const [regions, setRegions] = useState<string[]>([]);
    const [predictOptions, setPredictOptions] = useState<PredictionOptions>({});
    const [indicatorOptions, setIndicatorOptions] = useState<Record<string, string>>({});
    const [result, setResult] = useState<PredictionResponse | null>(null);
    const [historySeries, setHistorySeries] = useState<HistoryPoint[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [insightText, setInsightText] = useState("");
    const [dataObj, setDataObj] = useState<DataObj>({
        region: '',
        indicator: '',
        year: 2025
    });

    const predictRef = useRef<HTMLDivElement | null>(null);
    const selectedIndicatorLabel = indicatorOptions[dataObj.indicator] ?? "Indicator";
    const selectedMeta = useMemo(
        () => getIndicatorMeta(dataObj.indicator, selectedIndicatorLabel),
        [dataObj.indicator, selectedIndicatorLabel],
    );
    const formatForIndicator = (value: unknown) => formatIndicatorValue(value, selectedMeta);
    const formatAxisTick = (value: number) => Number(value).toLocaleString();
    const hasPredictionData = result !== null;

    function updateData(e: ChangeEvent<HTMLSelectElement | HTMLInputElement>, action: string){
        if(action === "region"){
            const reg = e?.target?.value;
            setDataObj(dataObj => ({
                ...dataObj,
                region: reg
            }))
        } else if(action === "indicator"){
            const ind = e?.target?.value;
            setDataObj(dataObj => ({
                ...dataObj,
                indicator: ind
            }))
        } else if(action === "year"){
            const y = e?.target?.value;
            setDataObj(dataObj => ({
                ...dataObj,
                year: Number(y)
            }))
        } else {
            // shouldn't happen but just in case
            console.warn("unknown action:", action)
        }
    }

    async function getPrediction(){
        if(!dataObj.region || !dataObj.indicator){
            return;
        }

        if(dataObj.year >= 2025 && dataObj.year <=2035){
            setIsLoading(true);
            try {
                const [prediction, timeSeries] = await Promise.all([
                    apiService.getPredictedPrice(dataObj.region, dataObj.indicator, dataObj.year),
                    apiService.getTimeSeries(dataObj.indicator, dataObj.region),
                ]);

                if (prediction && typeof prediction === "object") {
                    setResult(prediction as PredictionResponse);
                    const pred = prediction as Record<string, unknown>;
                    if (typeof pred.insight === "string") {
                        setInsightText(pred.insight);
                    }
                }

                const tsSource = timeSeries && typeof timeSeries === "object" ? timeSeries as Record<string, unknown> : {};
                const rows = Array.isArray(timeSeries)
                    ? timeSeries
                    : (Array.isArray(tsSource.data) ? tsSource.data : (Array.isArray(tsSource.series) ? tsSource.series : []));

                const parsed = rows
                    .map((row) => {
                        if (!row || typeof row !== "object") {
                            return null;
                        }
                        const entry = row as Record<string, unknown>;
                        const year = typeof entry.year === "number" ? entry.year : Number(entry.year);
                        const valueCandidate = entry.value ?? entry.actual ?? entry.mean ?? entry.median ?? entry.y;
                        const value = typeof valueCandidate === "number" ? valueCandidate : Number(valueCandidate);

                        if (!Number.isFinite(year) || !Number.isFinite(value)) {
                            return null;
                        }
                        return { year, value };
                    })
                    .filter((row): row is HistoryPoint => row !== null)
                    .sort((a, b) => a.year - b.year)
                    .slice(-7);

                if (parsed.length > 0) {
                    setHistorySeries(parsed);
                }
            } finally {
                setIsLoading(false);
            }
        }
    }

    const chartData = useMemo<ChartPoint[]>(() => {
        if (!hasPredictionData) {
            return [];
        }

        const predicted = result?.predicted_value ?? result?.prediction ?? result?.value;
        if (predicted === undefined) {
            return [];
        }

        const historical = (historySeries.length > 0 ? historySeries : (result?.historical ?? []))
            .slice()
            .sort((a, b) => a.year - b.year);

        const latestHistoricalYear = historical[historical.length - 1]?.year;
        const startYear = latestHistoricalYear !== undefined
            ? Math.min(latestHistoricalYear, dataObj.year)
            : dataObj.year;
        const endYear = dataObj.year;

        const historicalByYear = new Map<number, number>(
            historical
                .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.value))
                .map((point) => [point.year, point.value]),
        );

        const basePoint = [...historicalByYear.entries()]
            .filter(([year]) => year <= endYear)
            .sort((a, b) => a[0] - b[0])
            .pop();

        const baseYear = basePoint?.[0] ?? startYear;
        const baseValue = basePoint?.[1] ?? predicted;

        const points: ChartPoint[] = [];
        for (let year = startYear; year <= endYear; year += 1) {
            const actualValue = historicalByYear.get(year);
            if (actualValue !== undefined) {
                const isBridgeYear = year === baseYear && year !== endYear;
                points.push({
                    year,
                    actual: actualValue,
                    prediction: isBridgeYear || year === endYear ? (year === endYear ? predicted : actualValue) : null,
                });
                continue;
            }

            if (endYear === baseYear) {
                points.push({ year, actual: null, prediction: year === endYear ? predicted : baseValue });
                continue;
            }

            const ratio = (year - baseYear) / (endYear - baseYear);
            const interpolated = baseValue + ((predicted - baseValue) * Math.max(0, Math.min(1, ratio)));
            points.push({ year, actual: null, prediction: interpolated });
        }

        return points;
    }, [dataObj.year, hasPredictionData, historySeries, result]);

    const chartTicks = useMemo(() => chartData.map((point) => point.year), [chartData]);

    const predictionValue = useMemo(() => {
        return result?.predicted_value ?? result?.prediction ?? result?.value ?? chartData[chartData.length - 1]?.prediction ?? undefined;
    }, [chartData, result]);

    const [lowerBound, upperBound] = useMemo(() => {
        if (result?.confidence_interval?.length === 2) {
            return result.confidence_interval;
        }
        if (typeof result?.lower_bound === "number" && typeof result?.upper_bound === "number") {
            return [result.lower_bound, result.upper_bound];
        }
        if (predictionValue === undefined) {
            return [undefined, undefined] as unknown as [number, number];
        }
        const swing = predictionValue * 0.08;
        return [predictionValue - swing, predictionValue + swing];
    }, [predictionValue, result]);

    useEffect(()=>{
        async function getOptions() {
            try {
                setIsOptionsLoading(true);
                const response = await apiService.getRegions();
                const safeRegions = Array.isArray(response) ? response : [];
                setRegions(safeRegions);

                const predictOptionsResponse = await apiService.getPredictOptions();
                if (predictOptionsResponse && typeof predictOptionsResponse === "object") {
                    setPredictOptions(predictOptionsResponse as PredictionOptions);
                }

                const indicators = await apiService.getIndicatorOptions();
                if (indicators && typeof indicators === "object") {
                    setIndicatorOptions(indicators as Record<string, string>);
                }

                const firstRegion = safeRegions[0] ?? "";
                const indicatorEntries = indicators && typeof indicators === "object" ? Object.keys(indicators as Record<string, string>) : [];
                const firstIndicator = indicatorEntries[0] ?? "";

                setDataObj((prev) => ({
                    ...prev,
                    region: prev.region || firstRegion,
                    indicator: prev.indicator || firstIndicator,
                }));

            } catch (err) {
                console.error("Error in getRegions>> Predict page: ", err)
            } finally {
                setIsOptionsLoading(false);
            }
        }
        getOptions()
    }, [])

    useStaggerReveal(predictRef, ".predict-animate");

    useEffect(() => {
        if (!dataObj.region || !dataObj.indicator) {
            return;
        }
        void getPrediction();
    }, [dataObj.indicator, dataObj.region, dataObj.year]);

    return (
        <div ref={predictRef} className="predict-page">
            <div className="dashboard-disclaimer predict-animate">
                Disclaimer: Projections are estimates based on historical data. For educational use only. Not a policy recommendation tool.
            </div>
            <header className="predict-header predict-animate">
                <h1>{selectedIndicatorLabel} Predictor</h1>
                <p>Live prediction for {dataObj.region || "selected region"} with indicator-aware units, confidence interval, and trend context.</p>
            </header>

            <section className="predict-control-row predict-animate">
                <label>
                    Region
                    <select name="region" value={dataObj.region} id="region" onChange={(e)=> updateData(e, "region")}>
                        <option value="" disabled> Select a Region </option>
                        {regions.map((region)=> (
                            <option value={region} id={region} key={region}>{region}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Indicator
                    <select name="indicator" value={dataObj.indicator} id="indicator" onChange={(e)=> updateData(e, "indicator")}>
                        <option value="" disabled> Select an Indicator </option>
                        {Object.keys(indicatorOptions).map((indicator)=> (
                            <option value={indicator} id={indicator} key={indicator}>{indicatorOptions[indicator]}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Target Year
                    <input
                        type="number"
                        value={dataObj.year}
                        min={predictOptions?.prediction_range?.[0] || 2025}
                        max={predictOptions?.prediction_range?.[1] || 2035}
                        onChange={(e) => updateData(e, "year")}
                    />
                </label>
                <button type="button" onClick={getPrediction} disabled={isLoading || !dataObj.region || !dataObj.indicator}>
                    {isLoading ? "Generating..." : "Predict"}
                </button>
            </section>

            <section className="predict-grid">
                <article className="panel predict-animate">
                    <h2>Projected {selectedIndicatorLabel}</h2>
                    {isOptionsLoading || isLoading || !hasPredictionData || predictionValue === undefined ? (
                        <div className="loading-block" aria-label="Loading projected value" />
                    ) : (
                        <p className="predict-primary">{formatForIndicator(predictionValue)}</p>
                    )}
                    <p className="predict-secondary">{dataObj.region || "Region"} · {dataObj.year}</p>
                </article>

                <article className="panel predict-animate">
                    <h2>Confidence Interval (95%)</h2>
                    {isOptionsLoading || isLoading || !hasPredictionData || predictionValue === undefined ? (
                        <div className="loading-inline" aria-label="Loading confidence interval" />
                    ) : (
                        <>
                            <p className="predict-secondary">{formatForIndicator(lowerBound)} to {formatForIndicator(upperBound)}</p>
                            <div className="confidence-band" aria-hidden="true">
                                <span className="confidence-fill" />
                            </div>
                        </>
                    )}
                </article>

                <article className="panel chart-span predict-animate">
                    <h2>{selectedIndicatorLabel} Trend Timeline</h2>
                    <div className="chart-wrap">
                        {isOptionsLoading || isLoading || !hasPredictionData || chartData.length === 0 ? (
                            <div className="loading-chart" role="status" aria-live="polite">
                                <div className="loading-spinner" />
                                <span>Loading trend data...</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={chartData} margin={{ left: 18, right: 10, top: 8, bottom: 6 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d2dbe6" />
                                    <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} ticks={chartTicks} allowDecimals={false} />
                                    <YAxis width={96} tickFormatter={formatAxisTick} />
                                    <Tooltip formatter={formatForIndicator} />
                                    <Line type="monotone" dataKey="actual" name="Historical" stroke="#125f7a" strokeWidth={2.6} dot={false} />
                                    <Line type="monotone" dataKey="prediction" name="Forecast" stroke="#2a6f97" strokeDasharray="6 6" strokeWidth={2.6} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                {insightText && !isLoading ? (
                    <article className="panel chart-span predict-animate">
                        <h2>AI Insight</h2>
                        <p className="insight-text">{insightText}</p>
                    </article>
                ) : null}
            </section>
        </div>
    )
}

export default PredictionPage;