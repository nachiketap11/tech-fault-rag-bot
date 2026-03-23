def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """
    Basic character-based chunking.
    Good enough for v1.
    """
    if not text:
        return []

    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == text_length:
            break

        start = end - overlap

    return chunks


def chunk_page_records(page_records: list[dict]) -> list[dict]:
    """
    Expands page records into chunk records with metadata.
    """
    chunked_records = []

    for record in page_records:
        chunks = chunk_text(record["text"])

        for idx, chunk in enumerate(chunks, start=1):
            chunked_records.append(
                {
                    "source": record["source"],
                    "page": record["page"],
                    "chunk_index": idx,
                    "text": chunk,
                }
            )

    return chunked_records