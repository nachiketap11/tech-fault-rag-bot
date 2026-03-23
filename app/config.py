import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CHROMA_PATH = "data/chroma_db"
DOCS_PATH = "data/raw_docs"
COLLECTION_NAME = "tech_fault_docs"
EMBEDDING_MODEL = "text-embedding-3-small"