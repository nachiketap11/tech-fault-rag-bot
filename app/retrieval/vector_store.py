import chromadb
from app.config import CHROMA_PATH, COLLECTION_NAME


def get_collection():
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    return collection