from pathlib import Path
from pypdf import PdfReader


def load_pdf_pages(pdf_path: str) -> list[dict]:
    """
    Returns a list of page-level records:
    {
        "source": "file.pdf",
        "page": 1,
        "text": "page text..."
    }
    """
    records = []
    reader = PdfReader(pdf_path)

    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = text.strip()

        if not text:
            continue

        records.append(
            {
                "source": Path(pdf_path).name,
                "page": i,
                "text": text,
            }
        )

    return records