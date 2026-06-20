from fastapi import HTTPException
from openai import OpenAI, OpenAIError

from app.config import EMBEDDING_MODEL, OPENAI_API_KEY
from app.retrieval.vector_store import get_collection

client = OpenAI(api_key=OPENAI_API_KEY)

MIN_TOP_K = 1
MAX_TOP_K = 10


def embed_query(text: str) -> list[float]:
    try:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
        )
    except OpenAIError as error:
        raise HTTPException(status_code=502, detail="Embedding service unavailable.") from error
    return response.data[0].embedding


def retrieve_chunks(query: str, top_k: int = 5) -> list[dict]:
    top_k = max(MIN_TOP_K, min(top_k, MAX_TOP_K))
    query_embedding = embed_query(query)

    try:
        collection = get_collection()
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
        )
    except Exception as error:
        raise HTTPException(status_code=503, detail="Vector search unavailable.") from error

    docs = results["documents"][0]
    metas = results["metadatas"][0]

    return [
        {
            "text": doc,
            "source": meta["source"],
            "page": meta["page"],
            "chunk_index": meta["chunk_index"],
        }
        for doc, meta in zip(docs, metas)
    ]
