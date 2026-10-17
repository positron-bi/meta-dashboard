"""Refresh monthly aggregates from the local Sepidar SQL Server and rebuild JSON.

This must run on a machine that can reach the accounting database. It intentionally
queries only month-level aggregates; voucher descriptions and identifiers are not
exported to the public dashboard.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from meta_calculations import enrich_monthly

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "dashboard-data.json"

SQL = r"""
WITH AccountPath AS (
    SELECT AccountId, ParentAccountRef, Code, Title,
           CAST(Code AS nvarchar(200)) AS FullCode
    FROM ACC.Account WHERE ParentAccountRef IS NULL
    UNION ALL
    SELECT c.AccountId, c.ParentAccountRef, c.Code, c.Title,
           CAST(p.FullCode + N'-' + c.Code AS nvarchar(200)) AS FullCode
    FROM ACC.Account AS c
    INNER JOIN AccountPath AS p ON c.ParentAccountRef = p.AccountId
)
SELECT
    dd.JYear AS [year], dd.JMonthN AS [monthNumber],
    CONCAT(dd.JYear, '/', RIGHT('0' + CAST(dd.JMonthN AS varchar(2)), 2),
           ' - ', dd.JMonthT) AS [monthLabel],
    dd.JYear * 100 + dd.JMonthN AS [monthSort],
    MAX(dd.Jalali_1) AS [lastVoucherDate],
    (SELECT MAX(sdd.Jalali_1)
     FROM SLS.Invoice AS si
     INNER JOIN GNR.DimDate AS sdd ON sdd.Miladi = CAST(si.[Date] AS date))
        AS [lastSalesInvoiceDate],
    CAST(SUM(vi.Debit) AS decimal(38,4)) AS [debit],
    CAST(SUM(vi.Credit) AS decimal(38,4)) AS [credit],
    COUNT(DISTINCT v.VoucherId) AS [voucherCount],
    COUNT_BIG(*) AS [itemCount],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-11-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [currentAssetsActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-12-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [nonCurrentAssetsActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-21-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [currentLiabilitiesActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-22-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [nonCurrentLiabilitiesActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-31-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [equityActivity],
    CAST(SUM(CASE WHEN v.Type <> 3 AND ap.FullCode LIKE N'0-41-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [netSales],
    CAST(SUM(CASE WHEN v.Type <> 3 AND ap.FullCode LIKE N'0-51-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [costOfGoodsSold],
    CAST(SUM(CASE WHEN v.Type <> 3 AND ap.FullCode LIKE N'0-61-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [operatingExpense],
    CAST(SUM(CASE WHEN v.Type <> 3 AND ap.FullCode LIKE N'0-62-10-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [financeCost],
    CAST(SUM(CASE WHEN v.Type <> 3 AND ap.FullCode LIKE N'0-62-11-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [otherIncome],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-11-10-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [cashActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-11-11-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [restrictedCashActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-11-12-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [tradeReceivablesActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-11-18-%' THEN vi.Debit-vi.Credit ELSE 0 END) AS decimal(38,4)) AS [prepaymentActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-21-10-%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [tradePayablesActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-22-11-%' OR ap.Title LIKE N'%تسهيلات%' OR ap.Title LIKE N'%وام%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [loansActivity],
    CAST(SUM(CASE WHEN ap.FullCode LIKE N'0-4%' OR ap.FullCode LIKE N'0-5%' OR ap.FullCode LIKE N'0-6%' THEN vi.Credit-vi.Debit ELSE 0 END) AS decimal(38,4)) AS [unclosedProfitLossActivity]
FROM ACC.Voucher AS v
INNER JOIN ACC.VoucherItem AS vi ON vi.VoucherRef = v.VoucherId
INNER JOIN AccountPath AS ap ON ap.AccountId = vi.AccountSLRef
INNER JOIN GNR.DimDate AS dd ON dd.Miladi = CAST(v.[Date] AS date)
GROUP BY dd.JYear, dd.JMonthN, dd.JMonthT
OPTION (MAXRECURSION 20);
"""


def load_env_file() -> None:
    """Load optional local key=value settings without adding a dependency."""
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def json_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def main() -> None:
    load_env_file()
    server = os.getenv("SQL_SERVER")
    database = os.getenv("SQL_DATABASE", "Sepidar04")
    if not server:
        raise SystemExit("Set SQL_SERVER in .env.local or the environment; no server address is embedded in this repository.")
    try:
        import pyodbc
    except ImportError as exc:
        raise SystemExit("Install pyodbc and a Microsoft SQL Server ODBC driver before refreshing.") from exc

    driver = os.getenv("SQL_DRIVER", "ODBC Driver 18 for SQL Server")
    username = os.getenv("SQL_USERNAME")
    password = os.getenv("SQL_PASSWORD")
    if username and password:
        auth = f"UID={username};PWD={password};"
    else:
        auth = "Trusted_Connection=yes;"
    connection_string = f"DRIVER={{{driver}}};SERVER={server};DATABASE={database};{auth}TrustServerCertificate=yes;"
    with pyodbc.connect(connection_string, timeout=30) as connection:
        cursor = connection.cursor()
        cursor.execute(SQL)
        fields = [column[0] for column in cursor.description]
        rows = [{field: json_value(value) for field, value in zip(fields, row)} for row in cursor.fetchall()]

    if not rows:
        raise SystemExit("The SQL query returned no monthly summary rows; existing dashboard data was left unchanged.")
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    payload["financialKpi"] = enrich_monthly(rows)
    payload["extractedAt"] = datetime.now(timezone.utc).astimezone().isoformat()
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {len(rows)} monthly summary rows. No voucher-level records were exported.")


if __name__ == "__main__":
    main()
