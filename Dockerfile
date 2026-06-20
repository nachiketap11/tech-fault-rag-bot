FROM python:3.14-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY app/ ./app/
COPY scripts/ ./scripts/

RUN mkdir -p data/raw_docs data/chroma_db

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
