"""
Run this ONCE to create the MySQL database and load the Telco dataset.
Usage: python setup_db.py
"""
import pymysql
import pandas as pd
import numpy as np
import os
import sys

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_USER     = os.getenv("DB_USER",     "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME",     "churn_db")

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH  = os.path.join(BASE_DIR, "..", "..", "ML", "Dataset", "Telco_customer_churn.xlsx")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS customers (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    customer_id      VARCHAR(50),
    gender           VARCHAR(10),
    senior_citizen   VARCHAR(5),
    partner          VARCHAR(5),
    dependents       VARCHAR(5),
    tenure_months    INT,
    phone_service    VARCHAR(5),
    multiple_lines   VARCHAR(30),
    internet_service VARCHAR(30),
    online_security  VARCHAR(30),
    online_backup    VARCHAR(30),
    device_protection VARCHAR(30),
    tech_support     VARCHAR(30),
    streaming_tv     VARCHAR(30),
    streaming_movies VARCHAR(30),
    contract         VARCHAR(30),
    paperless_billing VARCHAR(5),
    payment_method   VARCHAR(60),
    monthly_charges  DECIMAL(10,2),
    total_charges    DECIMAL(10,2),
    churn_label      VARCHAR(5),
    churn_value      TINYINT,
    churn_score      INT,
    cltv             INT,
    churn_reason     VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

INSERT_SQL = """
INSERT INTO customers (
    customer_id, gender, senior_citizen, partner, dependents,
    tenure_months, phone_service, multiple_lines, internet_service,
    online_security, online_backup, device_protection, tech_support,
    streaming_tv, streaming_movies, contract, paperless_billing,
    payment_method, monthly_charges, total_charges,
    churn_label, churn_value, churn_score, cltv, churn_reason
) VALUES (
    %(CustomerID)s, %(Gender)s, %(Senior Citizen)s, %(Partner)s, %(Dependents)s,
    %(Tenure Months)s, %(Phone Service)s, %(Multiple Lines)s, %(Internet Service)s,
    %(Online Security)s, %(Online Backup)s, %(Device Protection)s, %(Tech Support)s,
    %(Streaming TV)s, %(Streaming Movies)s, %(Contract)s, %(Paperless Billing)s,
    %(Payment Method)s, %(Monthly Charges)s, %(Total Charges)s,
    %(Churn Label)s, %(Churn Value)s, %(Churn Score)s, %(CLTV)s, %(Churn Reason)s
)
"""


def main():
    print("── Connecting to MySQL ──────────────────────────────────")
    try:
        conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
                               charset="utf8mb4",
                               cursorclass=pymysql.cursors.DictCursor)
    except pymysql.err.OperationalError as e:
        print(f"ERROR: Cannot connect to MySQL: {e}")
        print("Make sure MySQL is running and credentials are correct.")
        sys.exit(1)

    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4")
        cur.execute(f"USE `{DB_NAME}`")
        conn.commit()
        print(f"  Database '{DB_NAME}' ready.")

        cur.execute(CREATE_TABLE_SQL)
        conn.commit()
        print("  Table 'customers' ready.")

        cur.execute("SELECT COUNT(*) as n FROM customers")
        existing = cur.fetchone()["n"]
        if existing > 0:
            print(f"  Table already has {existing} rows — skipping data load.")
            print("  (Delete all rows manually and re-run if you want to reload.)")
            conn.close()
            return

    print(f"\n── Loading Excel: {EXCEL_PATH}")
    if not os.path.exists(EXCEL_PATH):
        print(f"ERROR: File not found: {EXCEL_PATH}")
        sys.exit(1)

    df = pd.read_excel(EXCEL_PATH)
    print(f"  Loaded {len(df)} rows × {len(df.columns)} columns.")

    # Fix Total Charges
    df["Total Charges"] = pd.to_numeric(df["Total Charges"], errors="coerce").fillna(0)

    print("── Inserting rows into MySQL (batch of 500) ─────────────")
    records = df.to_dict("records")

    # Convert every numpy nan / float nan to None so pymysql accepts it
    import math
    def clean(rec):
        return {
            k: (None if (v is not None and isinstance(v, float) and math.isnan(v)) else v)
            for k, v in rec.items()
        }
    records = [clean(r) for r in records]
    batch_size = 500

    with conn.cursor() as cur:
        cur.execute(f"USE `{DB_NAME}`")
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            cur.executemany(INSERT_SQL, batch)
            conn.commit()
            print(f"  Inserted rows {i+1}–{min(i+batch_size, len(records))}")

    conn.close()
    print(f"\n✅  Done! {len(records)} customers loaded into '{DB_NAME}.customers'.")


if __name__ == "__main__":
    main()
