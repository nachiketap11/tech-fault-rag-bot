from app.services.qa import answer_with_citations

if __name__ == "__main__":
    query = "How do I troubleshoot a modem that is not registering?"
    result = answer_with_citations(query, top_k=5)

    print("\nQUESTION:")
    print(result["question"])

    print("\nANSWER:")
    print(result["answer"])

    print("\nRETRIEVED CHUNKS:")
    for i, chunk in enumerate(result["retrieved_chunks"], start=1):
        print(
            f"[Source {i}] {chunk['source']} | page {chunk['page']} | chunk {chunk['chunk_index']}"
        )