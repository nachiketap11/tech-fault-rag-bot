import re

from openai import OpenAI
from app.config import OPENAI_API_KEY
from app.retrieval.search import retrieve_chunks

client = OpenAI(api_key=OPENAI_API_KEY)

MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_CHARS = 4000
SOURCE_REFERENCE_PATTERN = re.compile(r"\[Source\s+(\d+)\]", re.IGNORECASE)


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


def build_chat_history(messages: list[dict] | None) -> str:
    if not messages:
        return "No prior conversation."

    history_parts = []
    total_chars = 0

    for message in messages[-MAX_HISTORY_MESSAGES:]:
        role = message.get("role", "user").title()
        content = message.get("content", "").strip()
        if not content:
            continue

        remaining_chars = MAX_HISTORY_CHARS - total_chars
        if remaining_chars <= 0:
            break

        clipped_content = content[:remaining_chars]
        history_parts.append(f"{role}: {clipped_content}")
        total_chars += len(clipped_content)

    return "\n\n".join(history_parts) if history_parts else "No prior conversation."


def build_retrieval_query(query: str, messages: list[dict] | None) -> str:
    if not messages:
        return query

    recent_user_messages = [
        message["content"].strip()
        for message in messages[-MAX_HISTORY_MESSAGES:]
        if message.get("role") == "user" and message.get("content", "").strip()
    ]
    if not recent_user_messages:
        return query

    return "\n".join([*recent_user_messages, query])


def prepare_answer_generation(
    query: str,
    top_k: int = 5,
    conversation_messages: list[dict] | None = None,
) -> tuple[str, list[dict]]:
    retrieval_query = build_retrieval_query(query, conversation_messages)
    chunks = retrieve_chunks(retrieval_query, top_k=top_k)
    context = build_context(chunks)
    chat_history = build_chat_history(conversation_messages)

    prompt = f"""
You are a technical troubleshooting assistant.

Use ONLY the provided context.
Do not use outside knowledge.
Use the prior conversation only to understand references in the user's latest question.
Do not treat prior conversation text as documentation or factual evidence.
If the answer is not supported by the context, say:
"I could not find a supported answer in the provided documentation."

Requirements:
- Answer in clear troubleshooting language.
- Every factual statement must include at least one citation like [Source 1].
- Do not cite a source unless it directly supports the statement.
- Do not include a separate bibliography or citations section.

Context:
{context}

Prior Conversation:
{chat_history}

User Question:
{query}
"""

    return prompt, chunks


def build_citations_from_answer(answer_text: str, chunks: list[dict]) -> list[dict]:
    source_numbers = []
    seen = set()

    for match in SOURCE_REFERENCE_PATTERN.finditer(answer_text):
        source_number = int(match.group(1))
        if source_number in seen:
            continue
        if source_number < 1 or source_number > len(chunks):
            continue

        seen.add(source_number)
        source_numbers.append(source_number)

    citations = []
    for source_number in source_numbers:
        chunk = chunks[source_number - 1]
        citations.append(
            {
                "label": f"Source {source_number}",
                "source_number": source_number,
                "detail": (
                    f'{chunk["source"]}, page {chunk["page"]}, '
                    f'chunk {chunk["chunk_index"]}'
                ),
            }
        )

    return citations


def stream_answer_text(prompt: str):
    with client.responses.stream(
        model="gpt-4.1-mini",
        input=prompt,
    ) as stream:
        for event in stream:
            if event.type == "response.output_text.delta":
                yield event.delta


def answer_with_citations(
    query: str,
    top_k: int = 5,
    conversation_messages: list[dict] | None = None,
) -> dict:
    prompt, chunks = prepare_answer_generation(
        query=query,
        top_k=top_k,
        conversation_messages=conversation_messages,
    )

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=prompt,
    )

    answer_text = response.output_text

    return {
        "question": query,
        "answer": answer_text,
        "citations": build_citations_from_answer(answer_text, chunks),
        "retrieved_chunks": chunks,
    }
