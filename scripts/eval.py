"""
Offline RAG evaluation script.

Runs a fixed set of troubleshooting questions through the pipeline and reports:
  - How many sources were cited in each answer
  - Which expected keywords appeared in the answer
  - An aggregate keyword coverage score

Run:
    uv run python scripts/eval.py

Requires a populated ChromaDB (run scripts/ingest_docs.py first) and OPENAI_API_KEY.
"""
import json
import sys

from app.services.qa import answer_with_citations

EVAL_QUESTIONS = [
    {
        "question": "How do I troubleshoot a modem that is not registering?",
        "expected_keywords": ["register", "provisioning", "DHCP", "TFTP"],
    },
    {
        "question": "What are common causes of wireless connectivity issues?",
        "expected_keywords": ["interference", "signal", "channel", "SSID"],
    },
    {
        "question": "How do I resolve a UCS fault?",
        "expected_keywords": ["fault", "UCS", "alert", "severity"],
    },
    {
        "question": "What steps should I take when a Cisco device shows an error?",
        "expected_keywords": ["log", "error", "troubleshoot", "Cisco"],
    },
]


def run_eval() -> None:
    results = []
    print(f"Evaluating {len(EVAL_QUESTIONS)} questions...\n")

    for item in EVAL_QUESTIONS:
        print(f"Q: {item['question']}")
        try:
            result = answer_with_citations(item["question"], top_k=5)
        except Exception as error:
            print(f"  ERROR: {error}\n")
            continue

        answer_lower = result["answer"].lower()
        citations_found = len(result["citations"])
        chunks_retrieved = len(result["retrieved_chunks"])
        keyword_hits = [kw for kw in item["expected_keywords"] if kw.lower() in answer_lower]
        keyword_score = len(keyword_hits) / len(item["expected_keywords"])

        results.append(
            {
                "question": item["question"],
                "citations_found": citations_found,
                "chunks_retrieved": chunks_retrieved,
                "keyword_hits": keyword_hits,
                "keyword_score": keyword_score,
            }
        )
        print(f"  Citations: {citations_found}  |  Chunks: {chunks_retrieved}")
        print(f"  Keyword coverage: {keyword_score:.0%} — hits: {keyword_hits}\n")

    if not results:
        print("No results — check your ChromaDB and OPENAI_API_KEY.")
        sys.exit(1)

    avg_keyword_score = sum(r["keyword_score"] for r in results) / len(results)
    citation_rate = sum(1 for r in results if r["citations_found"] > 0) / len(results)

    print("=" * 60)
    print(f"Questions evaluated : {len(results)}")
    print(f"Avg keyword coverage: {avg_keyword_score:.0%}")
    print(f"Citation rate       : {citation_rate:.0%}")
    print("\nFull results (JSON):")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    run_eval()
