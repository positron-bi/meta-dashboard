"""Calculation layer ported from the Meta Power BI model's monthly measures."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

RIALS_PER_BILLION_TOMAN = 10_000_000_000


def totals(rows: Iterable[Mapping]) -> dict[str, float]:
    rows = list(rows)

    def total(field: str) -> float:
        return sum(float(row.get(field, 0) or 0) for row in rows)

    revenue = total("netSales")
    cogs = total("costOfGoodsSold")
    operating_expense = total("operatingExpense")
    finance_cost = total("financeCost")
    other_income = total("otherIncome")
    operating_profit = revenue - cogs - operating_expense
    profit_before_tax = operating_profit - finance_cost + other_income
    return {
        "revenue": revenue,
        "costOfGoodsSold": cogs,
        "operatingExpense": operating_expense,
        "financeCost": finance_cost,
        "otherIncome": other_income,
        "totalExpenses": cogs + operating_expense + finance_cost,
        "grossProfit": revenue - cogs,
        "operatingProfit": operating_profit,
        "profitBeforeTax": profit_before_tax,
    }


def balance_at(rows: Iterable[Mapping], year: int, month: int) -> dict[str, float]:
    cutoff = year * 100 + month
    selected = [row for row in rows if int(row.get("monthSort", 0)) <= cutoff]

    def total(field: str) -> float:
        return sum(float(row.get(field, 0) or 0) for row in selected)

    current_assets = total("currentAssetsActivity")
    non_current_assets = total("nonCurrentAssetsActivity")
    current_liabilities = total("currentLiabilitiesActivity")
    non_current_liabilities = total("nonCurrentLiabilitiesActivity")
    equity = total("equityActivity") + total("unclosedProfitLossActivity")
    return {
        "currentAssets": current_assets,
        "nonCurrentAssets": non_current_assets,
        "currentLiabilities": current_liabilities,
        "nonCurrentLiabilities": non_current_liabilities,
        "assets": current_assets + non_current_assets,
        "liabilities": current_liabilities + non_current_liabilities,
        "equityAdjusted": equity,
        "workingCapital": current_assets - current_liabilities,
    }


def enrich_monthly(rows: list[dict]) -> list[dict]:
    """Add measure-equivalent summaries without adding voucher-level data."""
    ordered = sorted(rows, key=lambda row: int(row["monthSort"]))
    result = []
    for row in ordered:
        profit = totals([row])
        balance = balance_at(ordered, int(row["year"]), int(row["monthNumber"]))
        result.append({**row, "calculated": {**profit, **balance}})
    return result
