from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL
from app.retrieval.vector_store import get_collection

client = OpenAI(api_key=OPENAI_API_KEY)

MIN_TOP_K = 1
MAX_TOP_K = 10


def embed_query(text: str) -> list[float]:
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def retrieve_chunks(query: str, top_k: int = 5) -> list[dict]:
    top_k = max(MIN_TOP_K, min(top_k, MAX_TOP_K))
    collection = get_collection()
    query_embedding = embed_query(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]

    output = []
    for doc, meta in zip(docs, metas):
        output.append(
            {
                "text": doc,
                "source": meta["source"],
                "page": meta["page"],
                "chunk_index": meta["chunk_index"],
            }
        )

    return output
