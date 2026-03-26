# insights.py — plain-English insight generator
# uses simple string templates, no LLM needed

def generate_insight(region, indicator, growth_rate, year1, year2):
    if growth_rate > 0:
        direction = 'grow'
    elif growth_rate < 0:
        direction = 'decline'
    else:
        direction = 'remain stable'

    if direction == 'remain stable':
        return (
            f"{indicator} in {region} is projected to remain roughly stable "
            f"between {year1} and {year2}."
        )

    return (
        f"{indicator} in {region} is projected to {direction} "
        f"by {abs(growth_rate):.1f}% annually between {year1} and {year2}."
    )


def generate_comparison_insight(region1, region2, indicator, val1, val2, year):
    diff_pct = ((val1 - val2) / val2 * 100) if val2 != 0 else 0
    higher = region1 if val1 > val2 else region2

    # if they're basically the same, say so
    if abs(diff_pct) < 1.0:
        return (
            f"{indicator} is projected to be roughly equal in {region1} "
            f"and {region2} by {year}."
        )

    lower = region2 if higher == region1 else region1
    return (
        f"{higher} is projected to have {abs(diff_pct):.1f}% higher "
        f"{indicator.lower()} than {lower} by {year}."
    )
