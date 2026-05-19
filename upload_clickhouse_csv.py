import requests

# ---------- ClickHouse config ----------
HOST = "clickhouse.datazip.limechat.ai"
PORT = 8443
USER = "limechat_biaw_798fe45eb23647f7"
PASSWORD = "limechat_biaw_99bc540d688a92b2ff440d6d7a58c262f45e947e"

DB = "datawarehouse"
TABLE = "idam_intents"

# ---------- Google Sheet config ----------
SHEET_ID = "1QS2bqoNdddGuqWxEgwqbBsoUC58ZcfnH2mBpRnzss6U"
GID = "0"  # change if your tab gid is different
CSV_EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

BASE_URL = f"https://{HOST}:{PORT}/"


def run_sql(sql: str) -> str:
    r = requests.post(
        BASE_URL,
        auth=(USER, PASSWORD),
        data=sql.encode("utf-8"),
        timeout=60,
    )
    r.raise_for_status()
    return r.text


def main():
    # 1) download sheet CSV
    csv_resp = requests.get(CSV_EXPORT_URL, timeout=60)
    csv_resp.raise_for_status()
    csv_bytes = csv_resp.content

    # 2) create db/table
    run_sql(f"CREATE DATABASE IF NOT EXISTS {DB}")
    run_sql(
        f"""
        CREATE TABLE IF NOT EXISTS {DB}.{TABLE}
        (
            `Intent` String,
            `pre/post` String,
            `expected handling` String,
            `created_at` DateTime DEFAULT now(),
            `updated_at` DateTime DEFAULT now()
        )
        ENGINE = MergeTree
        ORDER BY tuple()
        """.strip()
    )

    # 3) insert CSV
    insert_q = f"INSERT INTO {DB}.{TABLE} FORMAT CSVWithNames"
    ins = requests.post(
        BASE_URL,
        auth=(USER, PASSWORD),
        params={"query": insert_q},
        data=csv_bytes,
        timeout=300,
    )
    ins.raise_for_status()

    # 4) verify
    cnt = run_sql(f"SELECT count(*) FROM {DB}.{TABLE}").strip()
    print(f"Upload successful. Total rows: {cnt}")


if __name__ == "__main__":
    main()
