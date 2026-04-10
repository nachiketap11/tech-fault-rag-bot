from openai import OpenAI
from app.config import OPENAI_API_KEY
from app.retrieval.search import retrieve_chunks

client = OpenAI(api_key=OPENAI_API_KEY)


def build_context(chunks: list[dict]) -> str:
    context_parts = []

    for i, chunk in enumerate(chunks, start=1):
        context_parts.append(
            f"""[Source {i}]
Document: {chunk["source"]}
Page: {chunk["page"]}
Chunk: {chunk["chunk_index"]}
Text: {chunk["text"]}
"""
        )

    return "\n\n".join(context_parts)


def parse_citations(answer_text: str) -> list[dict]:
    parts = answer_text.split("\nCitations\n")
    if len(parts) < 2:
        return []

    citations = []
    for line in parts[-1].strip().splitlines():
        cleaned_line = line.removeprefix("-").strip()
        if not cleaned_line:
            continue

        prefix, _, detail = cleaned_line.partition("]")
        source_label = prefix.removeprefix("[").strip() if prefix else "Source"
        source_number = None

        if source_label.lower().startswith("source "):
            number_text = source_label.split(" ", maxsplit=1)[-1].strip()
            if number_text.isdigit():
                source_number = int(number_text)

        citations.append(
            {
                "label": source_label,
                "source_number": source_number,
                "detail": detail.strip(),
            }
        )

    return citations


def answer_with_citations(query: str, top_k: int = 5) -> dict:
    chunks = retrieve_chunks(query, top_k=top_k)
    context = build_context(chunks)

    prompt = f"""
You are a technical troubleshooting assistant.

Use ONLY the provided context.
Do not use outside knowledge.
If the answer is not supported by the context, say:
"I could not find a supported answer in the provided documentation."

Requirements:
- Answer in clear troubleshooting language.
- Every factual statement must include at least one citation like [Source 1].
- Do not cite a source unless it directly supports the statement.
- End with a section titled exactly: Citations
- In that section, list only the sources you used, using this format:
  - [Source X] document_name, page N, chunk M

Context:
{context}

User Question:
{query}
"""

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=prompt,
    )

    answer_text = response.output_text

    return {
        "question": query,
        "answer": answer_text,
        "citations": parse_citations(answer_text),
        "retrieved_chunks": chunks,
    }
