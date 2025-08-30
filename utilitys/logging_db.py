import os
import sqlite3
import json
import time
from typing import Optional

# Database path inside project temp folder
_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'temp', 'wallet_logs.db'))

# Ensure temp directory exists
os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)

_MAX_TEXT = 10000  # truncate large bodies to 10KB

def _connect():
    return sqlite3.connect(_DB_PATH, check_same_thread=False)

def init_db():
    """Create tables if they do not exist."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS api_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                method TEXT,
                path TEXT,
                ip TEXT,
                status INTEGER,
                duration_ms INTEGER,
                req_body TEXT,
                resp_body TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS tx_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                ticker TEXT,
                action TEXT,
                status TEXT,
                txid TEXT,
                raw_tx TEXT,
                metadata TEXT,
                error TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS mint_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                ticker TEXT,
                receiving_address TEXT,
                sending_address TEXT,
                content_type TEXT,
                content_bytes INTEGER,
                utxo TEXT,
                vout INTEGER,
                utxo_amount_sats INTEGER,
                final_txid TEXT,
                pending_txs TEXT,
                ok INTEGER,
                error TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS error_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                context TEXT,
                message TEXT,
                details TEXT,
                extra TEXT
            )
            """
        )
        conn.commit()


def _json_dumps(obj) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        return str(obj)


def log_api(method: str, path: str, ip: str, status: int, duration_ms: int,
            req_body: Optional[str] = None, resp_body: Optional[str] = None):
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO api_logs(method, path, ip, status, duration_ms, req_body, resp_body)
                VALUES(?,?,?,?,?,?,?)
                """,
                (
                    method,
                    path,
                    ip,
                    int(status) if status is not None else None,
                    int(duration_ms) if duration_ms is not None else None,
                    (req_body or '')[:_MAX_TEXT],
                    (resp_body or '')[:_MAX_TEXT]
                )
            )
            conn.commit()
    except Exception:
        # Best-effort logging; avoid raising
        pass


def log_tx_event(ticker: str, action: str, status: str,
                 txid: Optional[str] = None, raw_tx: Optional[str] = None,
                 metadata: Optional[dict] = None, error: Optional[str] = None):
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO tx_logs(ticker, action, status, txid, raw_tx, metadata, error)
                VALUES(?,?,?,?,?,?,?)
                """,
                (
                    (ticker or '').upper(),
                    action,
                    status,
                    txid,
                    (raw_tx or '')[:_MAX_TEXT],
                    _json_dumps(metadata)[:_MAX_TEXT],
                    (error or '')[:_MAX_TEXT]
                )
            )
            conn.commit()
    except Exception:
        pass


def log_mint_event(ticker: str,
                   receiving_address: str,
                   sending_address: str,
                   content_type: str,
                   content_bytes: int,
                   utxo: str,
                   vout: Optional[int],
                   utxo_amount_sats: Optional[int],
                   final_txid: Optional[str],
                   pending_txs: Optional[list],
                   ok: bool,
                   error: Optional[str] = None):
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO mint_logs(ticker, receiving_address, sending_address, content_type, content_bytes,
                                      utxo, vout, utxo_amount_sats, final_txid, pending_txs, ok, error)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    (ticker or '').upper(),
                    receiving_address,
                    sending_address,
                    content_type,
                    int(content_bytes) if content_bytes is not None else None,
                    utxo,
                    int(vout) if vout is not None else None,
                    int(utxo_amount_sats) if utxo_amount_sats is not None else None,
                    final_txid,
                    _json_dumps(pending_txs)[:_MAX_TEXT],
                    1 if ok else 0,
                    (error or '')[:_MAX_TEXT]
                )
            )
            conn.commit()
    except Exception:
        pass


def log_error(context: str, message: str, details: Optional[str] = None, extra: Optional[dict] = None):
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO error_logs(context, message, details, extra)
                VALUES(?,?,?,?)
                """,
                (
                    context,
                    message,
                    details,
                    _json_dumps(extra)[:_MAX_TEXT]
                )
            )
            conn.commit()
    except Exception:
        pass