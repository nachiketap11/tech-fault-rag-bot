from app.services.qa import (
    build_chat_history,
    build_citations_from_answer,
    build_context,
    build_retrieval_query,
)


def test_build_context_empty():
    assert build_context([]) == ""


def test_build_context_labels_sources():
    chunks = [
        {"source": "guide.pdf", "page": 1, "chunk_index": 1, "text": "First chunk."},
        {"source": "guide.pdf", "page": 2, "chunk_index": 1, "text": "Second chunk."},
    ]
    context = build_context(chunks)
    assert "[Source 1]" in context
    assert "[Source 2]" in context
    assert "First chunk." in context
    assert "Second chunk." in context


def test_build_chat_history_none_returns_fallback():
    assert build_chat_history(None) == "No prior conversation."


def test_build_chat_history_empty_list_returns_fallback():
    assert build_chat_history([]) == "No prior conversation."


def test_build_chat_history_includes_messages():
    messages = [
        {"role": "user", "content": "What is DNS?"},
        {"role": "assistant", "content": "DNS stands for Domain Name System."},
    ]
    result = build_chat_history(messages)
    assert "What is DNS?" in result
    assert "DNS stands for Domain Name System." in result


def test_build_citations_parses_source_references():
    chunks = [
        {"source": "a.pdf", "page": 1, "chunk_index": 1, "text": ""},
        {"source": "a.pdf", "page": 2, "chunk_index": 1, "text": ""},
    ]
    answer = "Check step one [Source 1] and step two [Source 2]."
    citations = build_citations_from_answer(answer, chunks)
    assert len(citations) == 2
    assert citations[0]["label"] == "Source 1"
    assert citations[1]["label"] == "Source 2"


def test_build_citations_ignores_out_of_range():
    chunks = [{"source": "a.pdf", "page": 1, "chunk_index": 1, "text": ""}]
    answer = "See [Source 1] and [Source 9]."
    citations = build_citations_from_answer(answer, chunks)
    assert len(citations) == 1
    assert citations[0]["label"] == "Source 1"


def test_build_citations_deduplicates():
    chunks = [{"source": "a.pdf", "page": 1, "chunk_index": 1, "text": ""}]
    answer = "[Source 1] confirms this. Also see [Source 1] again."
    citations = build_citations_from_answer(answer, chunks)
    assert len(citations) == 1


def test_build_retrieval_query_no_history():
    assert build_retrieval_query("What is BGP?", None) == "What is BGP?"


def test_build_retrieval_query_prepends_history():
    messages = [{"role": "user", "content": "Prior question"}]
    result = build_retrieval_query("Follow-up question", messages)
    assert "Prior question" in result
    assert "Follow-up question" in result
