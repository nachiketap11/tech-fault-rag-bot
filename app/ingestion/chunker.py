import re


TOKEN_PATTERN = re.compile(r"\S+")
SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])|\n{2,}")


def count_tokens(text: str) -> int:
    """
    Lightweight token estimate based on whitespace-delimited pieces.
    This keeps chunking tied to model-sized units without adding tokenizer dependencies.
    """
    return len(TOKEN_PATTERN.findall(text))


def split_long_unit(text: str, max_tokens: int) -> list[str]:
    tokens = TOKEN_PATTERN.findall(text)
    if len(tokens) <= max_tokens:
        return [text.strip()]

    return [
        " ".join(tokens[i:i + max_tokens])
        for i in range(0, len(tokens), max_tokens)
    ]


def split_text_units(text: str, max_tokens: int) -> list[str]:
    normalized_text = re.sub(r"[ \t\r\f\v]+", " ", text).strip()
    raw_units = [
        unit.strip()
        for unit in SENTENCE_BOUNDARY_PATTERN.split(normalized_text)
        if unit.strip()
    ]

    units = []
    for unit in raw_units:
        units.extend(split_long_unit(unit, max_tokens))

    return units


def get_overlap_units(units: list[str], overlap_tokens: int) -> list[str]:
    if overlap_tokens <= 0:
        return []

    overlap = []
    token_count = 0

    for unit in reversed(units):
        unit_tokens = count_tokens(unit)
        if overlap and token_count + unit_tokens > overlap_tokens:
            break
        overlap.insert(0, unit)
        token_count += unit_tokens

    return overlap


def chunk_text(text: str, max_tokens: int = 220, overlap_tokens: int = 40) -> list[str]:
    """
    Sentence-aware token-budget chunking with overlap between adjacent chunks.
    """
    if not text:
        return []

    chunks = []
    current_units = []
    current_tokens = 0

    for unit in split_text_units(text, max_tokens):
        unit_tokens = count_tokens(unit)

        if current_units and current_tokens + unit_tokens > max_tokens:
            chunks.append(" ".join(current_units).strip())
            current_units = get_overlap_units(current_units, overlap_tokens)
            current_tokens = sum(count_tokens(current_unit) for current_unit in current_units)

        while current_units and current_tokens + unit_tokens > max_tokens:
            removed_unit = current_units.pop(0)
            current_tokens -= count_tokens(removed_unit)

        current_units.append(unit)
        current_tokens += unit_tokens

    if current_units:
        chunks.append(" ".join(current_units).strip())

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
