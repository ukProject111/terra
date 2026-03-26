export interface IndicatorMeta {
    label: string;
    prefix: string;
    suffix: string;
    decimals: number;
}

const toTitle = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

const inferMeta = (indicator: string, label?: string): IndicatorMeta => {
    const normalized = `${indicator} ${label ?? ""}`.toLowerCase();

    if (/(price|housing|value|cost|rent|salary|income|gdp)/.test(normalized)) {
        return { label: label ?? toTitle(indicator), prefix: "£", suffix: "", decimals: 0 };
    }

    if (/(employment|growth|rate|ratio|percent|pct|index|inflation|change|delta|return)/.test(normalized)) {
        return { label: label ?? toTitle(indicator), prefix: "", suffix: "%", decimals: 1 };
    }

    if (/(density)/.test(normalized)) {
        return { label: label ?? toTitle(indicator), prefix: "", suffix: " /km²", decimals: 1 };
    }

    if (/(transport|distance|kilometer|kilometre|km|mile)/.test(normalized)) {
        return { label: label ?? toTitle(indicator), prefix: "", suffix: " km", decimals: 2 };
    }

    return { label: label ?? toTitle(indicator), prefix: "", suffix: "", decimals: 2 };
};

export const getIndicatorMeta = (indicator: string, label?: string): IndicatorMeta => {
    if (!indicator && label) {
        return inferMeta(label, label);
    }
    return inferMeta(indicator, label);
};

export const formatIndicatorValue = (value: unknown, meta: IndicatorMeta): string => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return "-";
    }

    const formatted = numeric.toLocaleString(undefined, {
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
    });

    return `${meta.prefix}${formatted}${meta.suffix}`;
};
