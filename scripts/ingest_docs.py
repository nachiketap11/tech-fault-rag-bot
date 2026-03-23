from pathlib import Path
from app.config import DOCS_PATH
from app.ingestion.pdf_loader import load_pdf_pages
from app.ingestion.chunker import chunk_page_records
from app.ingestion.embedder import embed_texts
from app.retrieval.vector_store import get_collection


def batched(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def ingest_all_pdfs():
    docs_dir = Path(DOCS_PATH)
    pdf_files = list(docs_dir.glob("*.pdf"))

    if not pdf_files:
        print("No PDF files found in data/raw_docs/")
        return

    collection = get_collection()
    all_chunk_records = []

    for pdf_file in pdf_files:
        print(f"Loading {pdf_file.name}...")
        page_records = load_pdf_pages(str(pdf_file))
        chunk_records = chunk_page_records(page_records)
        all_chunk_records.extend(chunk_records)

    if not all_chunk_records:
        print("No text extracted from PDFs.")
        return

    print(f"Prepared {len(all_chunk_records)} chunks")

    add_batch_size = 1000

    for batch_num, chunk_batch in enumerate(batched(all_chunk_records, add_batch_size), start=1):
        texts = [r["text"] for r in chunk_batch]
        embeddings = embed_texts(texts)

        ids = [
            f'{r["source"]}-p{r["page"]}-c{r["chunk_index"]}'
            for r in chunk_batch
        ]

        metadatas = [
            {
                "source": r["source"],
                "page": r["page"],
                "chunk_index": r["chunk_index"],
            }
            for r in chunk_batch
        ]

        collection.add(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        print(f"Added batch {batch_num} ({len(chunk_batch)} chunks)")

    print(f"Ingested {len(all_chunk_records)} chunks from {len(pdf_files)} PDF(s).")


if __name__ == "__main__":
    ingest_all_pdfs()