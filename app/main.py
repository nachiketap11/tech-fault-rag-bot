from fastapi import FastAPI
from pydantic import BaseModel
from app.services.qa import answer_with_citations

app = FastAPI(title="Tech Fault RAG Bot")


class QuestionRequest(BaseModel):
    question: str
    top_k: int = 5


@app.get("/")
def root():
    return {"message": "Tech Fault RAG Bot is running"}


@app.post("/ask")
def ask_question(request: QuestionRequest):
    result = answer_with_citations(
        query=request.question,
        top_k=request.top_k,
    )
    return result