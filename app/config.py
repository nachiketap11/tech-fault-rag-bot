import os
from dotenv import load_dotenv

load_dotenv()


def _parse_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CHROMA_PATH = "data/chroma_db"
DOCS_PATH = "data/raw_docs"
COLLECTION_NAME = "tech_fault_docs"
EMBEDDING_MODEL = "text-embedding-3-small"
FRONTEND_ORIGINS = _parse_origins(os.getenv("FRONTEND_ORIGINS"))
