"""SQLite persistence and password/session helpers for Merchant Mode."""

import hashlib
import hmac
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Any


def _db_path() -> Path:
    return Path(os.environ.get("ARGUS_DB_PATH", "data/argus.sqlite3"))


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS merchant_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL UNIQUE REFERENCES merchant_accounts(id) ON DELETE CASCADE,
                shop_name TEXT NOT NULL,
                upi_id TEXT NOT NULL UNIQUE,
                upi_verification_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (upi_verification_status IN ('pending', 'verified')),
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_m REAL NOT NULL DEFAULT 150,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS merchant_sessions (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES merchant_accounts(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
        """)


def _password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000)


def _clean_vpa(vpa: str) -> str:
    return vpa.strip().lower()


def _merchant_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "shop_name": row["shop_name"],
        "upi_id": row["upi_id"],
        "upi_verification_status": row["upi_verification_status"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "radius_m": row["radius_m"],
        "updated_at": row["updated_at"],
    }


def register(email: str, password: str, shop_name: str, upi_id: str, latitude: float, longitude: float, radius_m: float) -> dict[str, Any]:
    email = email.strip().lower()
    salt = secrets.token_bytes(16)
    try:
        with _connect() as conn:
            cursor = conn.execute(
                "INSERT INTO merchant_accounts(email,password_salt,password_hash) VALUES(?,?,?)",
                (email, salt.hex(), _password(password, salt).hex()),
            )
            account_id = cursor.lastrowid
            conn.execute(
                "INSERT INTO merchants(account_id,shop_name,upi_id,latitude,longitude,radius_m) VALUES(?,?,?,?,?,?)",
                (account_id, shop_name.strip(), _clean_vpa(upi_id), latitude, longitude, radius_m),
            )
            return get_merchant(account_id, conn)
    except sqlite3.IntegrityError as exc:
        message = str(exc).lower()
        if "merchants.upi_id" in message or "upi_id" in message:
            raise ValueError("That UPI ID is already registered.") from exc
        if "merchant_accounts.email" in message or "email" in message:
            raise ValueError("An account with that email already exists.") from exc
        raise ValueError("This account already has a merchant profile.") from exc


def authenticate(email: str, password: str) -> tuple[str, dict[str, Any]] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM merchant_accounts WHERE email=?", (email.strip().lower(),)).fetchone()
        if row is None:
            return None
        candidate = _password(password, bytes.fromhex(row["password_salt"]))
        if not hmac.compare_digest(candidate, bytes.fromhex(row["password_hash"])):
            return None
        token = secrets.token_urlsafe(36)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        conn.execute("DELETE FROM merchant_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
        conn.execute("INSERT INTO merchant_sessions(token_hash,account_id,expires_at) VALUES(?,?,datetime('now','+12 hours'))", (token_hash, row["id"]))
        return token, get_merchant(row["id"], conn)


def account_for_token(token: str) -> int | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as conn:
        row = conn.execute("SELECT account_id FROM merchant_sessions WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP", (token_hash,)).fetchone()
        return int(row["account_id"]) if row else None


def logout(token: str) -> None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as conn:
        conn.execute("DELETE FROM merchant_sessions WHERE token_hash=?", (token_hash,))


def get_merchant(account_id: int, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    if conn is not None:
        row = conn.execute("SELECT a.email,m.* FROM merchants m JOIN merchant_accounts a ON a.id=m.account_id WHERE m.account_id=?", (account_id,)).fetchone()
        return _merchant_dict(row) if row else None
    with _connect() as owned:
        row = owned.execute("SELECT a.email,m.* FROM merchants m JOIN merchant_accounts a ON a.id=m.account_id WHERE m.account_id=?", (account_id,)).fetchone()
        return _merchant_dict(row) if row else None


def update_merchant(account_id: int, shop_name: str, upi_id: str, latitude: float, longitude: float, radius_m: float) -> dict[str, Any] | None:
    try:
        with _connect() as conn:
            old = conn.execute("SELECT upi_id FROM merchants WHERE account_id=?", (account_id,)).fetchone()
            if old is None:
                return None
            changed_upi = _clean_vpa(upi_id) != old["upi_id"]
            conn.execute("""UPDATE merchants SET shop_name=?,upi_id=?,latitude=?,longitude=?,radius_m=?,
                upi_verification_status=CASE WHEN ? THEN 'pending' ELSE upi_verification_status END,
                updated_at=CURRENT_TIMESTAMP WHERE account_id=?""",
                         (shop_name.strip(), _clean_vpa(upi_id), latitude, longitude, radius_m, changed_upi, account_id))
            return get_merchant(account_id, conn)
    except sqlite3.IntegrityError as exc:
        raise ValueError("That UPI ID is already registered.") from exc


def merchant_for_vpa(vpa: str | None) -> dict[str, Any] | None:
    if not vpa:
        return None
    with _connect() as conn:
        row = conn.execute("SELECT a.email,m.* FROM merchants m JOIN merchant_accounts a ON a.id=m.account_id WHERE m.upi_id=?", (_clean_vpa(vpa),)).fetchone()
        return _merchant_dict(row) if row else None


def pending_merchants() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("""SELECT a.email,m.* FROM merchants m
            JOIN merchant_accounts a ON a.id=m.account_id
            WHERE m.upi_verification_status='pending' ORDER BY m.updated_at""").fetchall()
        return [_merchant_dict(row) for row in rows]


def verify_upi(merchant_id: int, verified: bool) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT account_id FROM merchants WHERE id=?", (merchant_id,)).fetchone()
        if row is None:
            return None
        conn.execute("UPDATE merchants SET upi_verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", ("verified" if verified else "pending", merchant_id))
        return get_merchant(int(row["account_id"]), conn)
