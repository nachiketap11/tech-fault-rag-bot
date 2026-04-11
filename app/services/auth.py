import base64
import hashlib
import hmac
import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import ACCESS_TOKEN_EXPIRE_SECONDS, AUTH_SECRET_KEY, CHAT_DB_PATH

security = HTTPBearer(auto_error=False)


def _get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(CHAT_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_auth_db() -> None:
    with _get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def create_user(email: str, password: str) -> dict:
    normalized_email = email.strip().lower()
    if not normalized_email or not password:
        raise ValueError("Email and password are required")

    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    password_hash = hash_password(password)

    try:
        with _get_connection() as connection:
            connection.execute(
                """
                INSERT INTO users (id, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, normalized_email, password_hash, created_at),
            )
    except sqlite3.IntegrityError as error:
        raise ValueError("An account with that email already exists") from error

    return get_user_by_id(user_id)


def get_user_by_email(email: str) -> dict | None:
    normalized_email = email.strip().lower()
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, email, password_hash, created_at
            FROM users
            WHERE email = ?
            """,
            (normalized_email,),
        ).fetchone()

    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, email, password_hash, created_at
            FROM users
            WHERE id = ?
            """,
            (user_id,),
        ).fetchone()

    return dict(row) if row else None


def authenticate_user(email: str, password: str) -> dict | None:
    user = get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return None
    return user


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100_000,
    )
    return f"{base64.urlsafe_b64encode(salt).decode()}:{base64.urlsafe_b64encode(derived_key).decode()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_encoded, hash_encoded = stored_hash.split(":", maxsplit=1)
        salt = base64.urlsafe_b64decode(salt_encoded.encode())
        expected_hash = base64.urlsafe_b64decode(hash_encoded.encode())
    except ValueError:
        return False

    actual_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100_000,
    )
    return hmac.compare_digest(actual_hash, expected_hash)


def create_access_token(user: dict) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ACCESS_TOKEN_EXPIRE_SECONDS)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "exp": int(expires_at.timestamp()),
    }

    encoded_payload = _urlsafe_encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    encoded_signature = _urlsafe_encode(signature)
    return f"{encoded_payload}.{encoded_signature}"


def decode_access_token(token: str) -> dict:
    try:
        encoded_payload, encoded_signature = token.split(".", maxsplit=1)
        actual_signature = _urlsafe_decode(encoded_signature)
        payload = json.loads(_urlsafe_decode(encoded_payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from error

    expected_signature = hmac.new(
        AUTH_SECRET_KEY.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    if payload.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
        )

    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    payload = decode_access_token(credentials.credentials)
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return sanitize_user(user)


def sanitize_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "created_at": user["created_at"],
    }


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _urlsafe_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("utf-8"))
