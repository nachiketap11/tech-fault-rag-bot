import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import CHAT_DB_PATH


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(CHAT_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_history_db() -> None:
    Path(CHAT_DB_PATH).parent.mkdir(parents=True, exist_ok=True)

    with _get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                citations TEXT NOT NULL DEFAULT '[]',
                retrieved_chunks TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id)
            )
            """
        )


def list_conversations() -> list[dict]:
    with _get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def create_conversation(title: str = "New chat") -> dict:
    conversation_id = str(uuid.uuid4())
    now = _utc_now()

    with _get_connection() as connection:
        connection.execute(
            """
            INSERT INTO conversations (id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (conversation_id, title, now, now),
        )

    return get_conversation(conversation_id)


def get_conversation(conversation_id: str) -> dict | None:
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()

    return dict(row) if row else None


def list_messages(conversation_id: str) -> list[dict]:
    with _get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, conversation_id, role, content, citations, retrieved_chunks, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            """,
            (conversation_id,),
        ).fetchall()

    return [_deserialize_message(row) for row in rows]


def add_message(
    conversation_id: str,
    role: str,
    content: str,
    citations: list[dict] | None = None,
    retrieved_chunks: list[dict] | None = None,
) -> dict:
    message_id = str(uuid.uuid4())
    created_at = _utc_now()

    with _get_connection() as connection:
        connection.execute(
            """
            INSERT INTO messages (
                id,
                conversation_id,
                role,
                content,
                citations,
                retrieved_chunks,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                conversation_id,
                role,
                content,
                json.dumps(citations or []),
                json.dumps(retrieved_chunks or []),
                created_at,
            ),
        )
        connection.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
            """,
            (created_at, conversation_id),
        )

    return get_message(message_id)


def get_message(message_id: str) -> dict | None:
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, conversation_id, role, content, citations, retrieved_chunks, created_at
            FROM messages
            WHERE id = ?
            """,
            (message_id,),
        ).fetchone()

    return _deserialize_message(row) if row else None


def update_conversation_title(conversation_id: str, title: str) -> None:
    updated_at = _utc_now()

    with _get_connection() as connection:
        connection.execute(
            """
            UPDATE conversations
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (title, updated_at, conversation_id),
        )


def count_messages(conversation_id: str) -> int:
    with _get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS message_count
            FROM messages
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

    return int(row["message_count"]) if row else 0


def _deserialize_message(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "citations": json.loads(row["citations"]),
        "retrieved_chunks": json.loads(row["retrieved_chunks"]),
        "created_at": row["created_at"],
    }
