// chartHelpers.ts — shared helpers for normalising API responses
// into chart-ready data. pulled these out because Home, Predict,
// Compare and Analytics were all duplicating the same logic

const SERIES_START = 2023;

// safely coerce something to a number, or undefined if it's garbage
export function toNum(val: unknown): number | undefined {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
        const n = Number(val);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

// the API response shape varies a bit depending on endpoint,
// so we try a bunch of common keys to find the array of data
export function unwrapArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const obj = payload as Record<string, unknown>;
    // try these keys in order — different endpoints use different names
    for (const k of ['data', 'series', 'timeseries', 'history', 'rows', 'regions', 'stats']) {
        if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
    return [];
}

// turn whatever the API gives us into [{year, value}] sorted by year
export function parseTimeSeries(payload: unknown): Array<{year: number; value: number}> {
    const rows = unwrapArray(payload);
    return rows
        .map(entry => {
            if (!entry || typeof entry !== 'object') return null;
            const r = entry as Record<string, unknown>;

            // year might be in different fields
            const yr = toNum(r.year) ?? toNum(r.x) ?? toNum(r.timestamp);
            const dateYr = typeof r.date === 'string' ? Number(r.date.slice(0, 4)) : undefined;
            const year = yr ?? dateYr;

            // value could be called lots of things
            const value = toNum(r.value) ?? toNum(r.y) ?? toNum(r.actual)
                ?? toNum(r.mean) ?? toNum(r.median) ?? toNum(r.prediction);

            if (!year || value === undefined) return null;
            return { year, value };
        })
        .filter((r): r is {year: number; value: number} => r !== null)
        .sort((a, b) => a.year - b.year);
}

// builds a continuous line from known data points to a future target.
// fills gaps by linear interpolation from the last known point
export function buildLine(
    known: Array<{year: number; value: number}>,
    targetYear: number,
    targetValue: number,
): Array<{year: number; value: number}> {
    const start = Math.min(SERIES_START, targetYear);
    const sorted = known
        .filter(r => Number.isFinite(r.year) && Number.isFinite(r.value))
        .slice().sort((a, b) => a.year - b.year);

    const byYear = new Map(sorted.map(r => [r.year, r.value]));
    const last = sorted.filter(r => r.year <= targetYear).pop();
    const lastYear = last?.year ?? start;
    const lastVal = last?.value ?? targetValue;
    const anchor = sorted.filter(r => r.year <= start).pop()?.value ?? lastVal;

    const out: Array<{year: number; value: number}> = [];
    let carry = anchor;

    for (let y = start; y <= targetYear; y++) {
        if (byYear.has(y) && y <= lastYear) {
            carry = byYear.get(y)!;
            out.push({ year: y, value: carry });
        } else if (y <= lastYear) {
            out.push({ year: y, value: carry });
        } else {
            // interpolate towards target
            const denom = Math.max(targetYear - lastYear, 1);
            const t = (y - lastYear) / denom;
            const interp = lastVal + (targetValue - lastVal) * Math.max(0, Math.min(1, t));
            out.push({ year: y, value: interp });
        }
    }
    return out;
}
