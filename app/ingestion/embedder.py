from openai import OpenAI
from app.config import OPENAI_API_KEY, EMBEDDING_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)


def embed_texts(texts: list[str], batch_size: int = 100) -> list[list[float]]:
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])

        print(f"Embedded batch {i // batch_size + 1} ({len(batch)} chunks)")

    return all_embeddings