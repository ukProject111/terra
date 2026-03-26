import { useEffect, useMemo, useRef, useState } from "react";
import { apiService } from "../services/land_price";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getIndicatorMeta, formatIndicatorValue } from "../utils/indicatorMeta";
import { parseTimeSeries, buildLine } from "../utils/chartHelpers";
import { useStaggerReveal } from "../hooks/useStaggerReveal";
import "../styles/commonPages.css";

const SERIES_START_YEAR = 2023;

interface CompareResponse {
    region1_value?: number;
    region2_value?: number;
    delta_percent?: number;
    region1?: { value?: number };
    region2?: { value?: number };
}

const ComparePage = () => {
    const [regions, setRegions] = useState<string[]>([]);
    const [indicatorOptions, setIndicatorOptions] = useState<Record<string, string>>({});
    const [region1, setRegion1] = useState("");
    const [region2, setRegion2] = useState("");
    const [indicator, setIndicator] = useState("employment_rate");
    const [year, setYear] = useState(2030);
    const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
    const [series, setSeries] = useState<Array<{ year: number; region1: number; region2: number }>>([]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [hasInitialData, setHasInitialData] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [insightText, setInsightText] = useState("");

    const compareRef = useRef<HTMLDivElement | null>(null);
    const selectedIndicatorLabel = indicatorOptions[indicator] ?? "Indicator";
    const selectedMeta = useMemo(
        () => getIndicatorMeta(indicator, selectedIndicatorLabel),
        [indicator, selectedIndicatorLabel],
    );
    const formatForIndicator = (value: unknown) => formatIndicatorValue(value, selectedMeta);

    // only show the chart when we have real data from the API
    const comparisonTrend = useMemo(() => series, [series]);

    useEffect(() => {
        async function initialize() {
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

                const indicatorKeys = Object.keys(safeIndicators);
                const preferredRegion1 = safeRegions.includes("London") ? "London" : (safeRegions[0] ?? "");
                const preferredRegion2 = safeRegions.find((region) => region !== preferredRegion1) ?? (safeRegions[1] ?? preferredRegion1);
                const preferredIndicator = indicatorKeys.includes("employment_rate") ? "employment_rate" : (indicatorKeys[0] ?? "");

                setRegions(safeRegions);
                setIndicatorOptions(safeIndicators);
                setRegion1(preferredRegion1);
                setRegion2(preferredRegion2);
                setIndicator(preferredIndicator);
            } catch (error) {
                console.error("Error loading compare options:", error);
                setErrorMessage("Unable to load comparison options.");
            } finally {
                setIsOptionsLoading(false);
            }
        }

        void initialize();
    }, []);

    useStaggerReveal(compareRef, ".compare-animate");

    async function runCompare() {
        if (!region1 || !region2) {
            return;
        }

        setIsLoading(true);
        setErrorMessage("");
        try {
            const [compareResponse, region1SeriesResponse, region2SeriesResponse] = await Promise.all([
                apiService.compareRegions(region1, region2, indicator, year),
                apiService.getTimeSeries(indicator, region1),
                apiService.getTimeSeries(indicator, region2),
            ]);

            if (compareResponse && typeof compareResponse === "object") {
                setCompareResult(compareResponse as CompareResponse);
                const cr = compareResponse as Record<string, unknown>;
                if (typeof cr.insight === "string") {
                    setInsightText(cr.insight);
                }
            }

            const region1Series = parseTimeSeries(region1SeriesResponse);
            const region2Series = parseTimeSeries(region2SeriesResponse);

            if (region1Series.length >= 1 && region2Series.length >= 1) {
                const comparePayload = compareResponse && typeof compareResponse === "object" ? compareResponse as CompareResponse : null;
                const forecastRegion1 = comparePayload?.region1_value ?? comparePayload?.region1?.value ?? region1Series[region1Series.length - 1]?.value ?? 0;
                const forecastRegion2 = comparePayload?.region2_value ?? comparePayload?.region2?.value ?? region2Series[region2Series.length - 1]?.value ?? 0;

                const region1Continuous = buildLine(region1Series, year, forecastRegion1);
                const region2Continuous = buildLine(region2Series, year, forecastRegion2);
                const region1Map = new Map<number, number>(region1Continuous.map((row) => [row.year, row.value]));
                const region2Map = new Map<number, number>(region2Continuous.map((row) => [row.year, row.value]));

                const years = Array.from({ length: Math.max(year - SERIES_START_YEAR + 1, 1) }, (_, idx) => SERIES_START_YEAR + idx)
                    .filter((y) => y <= year);

                const merged = years
                    .map((y) => {
                        const first = region1Map.get(y);
                        const second = region2Map.get(y);
                        if (first === undefined || second === undefined) {
                            return null;
                        }
                        return { year: y, region1: Math.round(first), region2: Math.round(second) };
                    })
                    .filter((row): row is { year: number; region1: number; region2: number } => row !== null);

                setSeries(merged);
            } else {
                setSeries([]);
            }
        } catch (error) {
            console.error("Compare request failed:", error);
            setErrorMessage("Comparison request failed. Please try another indicator or region pair.");
        } finally {
            setIsLoading(false);
            setHasInitialData(true);
        }
    }

    useEffect(() => {
        if (!region1 || !region2 || !indicator) {
            return;
        }

        void runCompare();
    }, [region1, region2, indicator, year]);

    const lastTrend = comparisonTrend.length > 0 ? comparisonTrend[comparisonTrend.length - 1] : null;
    const region1Value = compareResult?.region1_value ?? compareResult?.region1?.value ?? lastTrend?.region1 ?? 0;
    const region2Value = compareResult?.region2_value ?? compareResult?.region2?.value ?? lastTrend?.region2 ?? 0;
    const delta = compareResult?.delta_percent ?? (region2Value !== 0 ? ((region1Value - region2Value) / region2Value) * 100 : 0);

    if (isOptionsLoading || (!hasInitialData && isLoading)) {
        return (
            <div className="compare-page">
                <div className="panel route-loader" role="status" aria-live="polite">
                    <div className="loading-spinner" />
                    <span>Loading comparison data...</span>
                </div>
            </div>
        );
    }

    return (
        <div ref={compareRef} className="compare-page">
            <div className="dashboard-disclaimer compare-animate">
                Disclaimer: Projections are estimates based on historical data. For educational use only. Not a policy recommendation tool.
            </div>
            <header className="predict-header compare-animate">
                <h1>{selectedIndicatorLabel} Comparison</h1>
                <p>Compare projected {selectedIndicatorLabel.toLowerCase()} between {region1 || "region 1"} and {region2 || "region 2"}.</p>
            </header>

            <section className="predict-control-row compare-animate">
                <label>
                    Region 1
                    <select value={region1} onChange={(e) => setRegion1(e.target.value)}>
                        {regions.map((region) => (
                            <option key={region} value={region}>{region}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Region 2
                    <select value={region2} onChange={(e) => setRegion2(e.target.value)}>
                        {regions.map((region) => (
                            <option key={region} value={region}>{region}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Indicator
                    <select value={indicator} onChange={(e) => setIndicator(e.target.value)}>
                        {Object.entries(indicatorOptions).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Year
                    <input type="number" min={2025} max={2035} value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </label>
                <button type="button" onClick={runCompare} disabled={isLoading || !region1 || !region2 || !indicator}>
                    {isLoading ? "Comparing..." : "Compare"}
                </button>
            </section>
            {errorMessage ? <p className="panel-subtitle">{errorMessage}</p> : null}

            <section className="predict-grid">
                <article className="panel compare-animate">
                    <h2>{region1 || "Region 1"}</h2>
                    {isLoading ? <div className="loading-block" /> : <p className="predict-primary">{formatForIndicator(region1Value)}</p>}
                </article>
                <article className="panel compare-animate">
                    <h2>{region2 || "Region 2"}</h2>
                    {isLoading ? <div className="loading-block" /> : <p className="predict-primary">{formatForIndicator(region2Value)}</p>}
                </article>
                <article className="panel compare-animate">
                    <h2>Delta</h2>
                    {isLoading ? <div className="loading-block" /> : <p className="predict-primary">{delta.toFixed(2)}%</p>}
                </article>
                <article className="panel chart-span compare-animate">
                    <h2>{selectedIndicatorLabel} Trend</h2>
                    <div className="chart-wrap">
                        {isLoading ? (
                            <div className="loading-chart"><div className="loading-spinner" /><span>Refreshing comparison...</span></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={comparisonTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#d2dbe6" />
                                    <XAxis dataKey="year" allowDecimals={false} />
                                    <YAxis />
                                    <Tooltip formatter={formatForIndicator} />
                                    <Line name={region1 || "Region 1"} dataKey="region1" stroke="#175676" strokeWidth={2.4} dot={false} />
                                    <Line name={region2 || "Region 2"} dataKey="region2" stroke="#3d8dad" strokeWidth={2.4} dot={false} strokeDasharray="5 5" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </article>

                {insightText && !isLoading ? (
                    <article className="panel chart-span compare-animate">
                        <h2>AI Insight</h2>
                        <p className="insight-text">{insightText}</p>
                    </article>
                ) : null}
            </section>
        </div>
    );
};

export default ComparePage;
