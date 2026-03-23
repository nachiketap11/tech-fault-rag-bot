from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL
from app.retrieval.vector_store import get_collection

client = OpenAI(api_key=OPENAI_API_KEY)


def embed_query(text: str) -> list[float]:
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def search(query: str, top_k: int = 3):
    collection = get_collection()
    query_embedding = embed_query(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
    )
    return results


if __name__ == "__main__":
    query = "How do I troubleshoot a modem that is not registering?"
    results = search(query)

    print("\nQUERY:", query)
    print("\nTOP RESULTS:\n")

    docs = results["documents"][0]
    metas = results["metadatas"][0]

    for i, (doc, meta) in enumerate(zip(docs, metas), start=1):
        print(f"Result {i}")
        print(f"Source: {meta['source']}")
        print(f"Page: {meta['page']}")
        print(f"Chunk: {meta['chunk_index']}")
        print(doc[:700])
        print("-" * 80)