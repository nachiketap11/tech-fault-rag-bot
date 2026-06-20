from app.ingestion.chunker import chunk_text, count_tokens


def test_empty_text_returns_no_chunks():
    assert chunk_text("") == []


def test_single_sentence_is_one_chunk():
    chunks = chunk_text("Hello world. This is a test.")
    assert len(chunks) == 1
    assert "Hello world" in chunks[0]


def test_chunks_respect_max_tokens():
    words = " ".join(["word"] * 300)
    chunks = chunk_text(words, max_tokens=100)
    assert len(chunks) > 1
    for chunk in chunks:
        assert count_tokens(chunk) <= 110  # small buffer for boundary units


def test_overlap_produces_shared_content():
    sentences = [f"Sentence number {i}." for i in range(20)]
    text = " ".join(sentences)
    chunks = chunk_text(text, max_tokens=30, overlap_tokens=10)
    assert len(chunks) > 1
    # Adjacent chunks should share some words due to overlap
    words_in_first = set(chunks[0].split())
    words_in_second = set(chunks[1].split())
    assert words_in_first & words_in_second


def test_whitespace_only_returns_no_chunks():
    assert chunk_text("   \n\n   ") == []


def test_count_tokens_counts_whitespace_delimited_words():
    assert count_tokens("hello world foo") == 3
    assert count_tokens("") == 0
