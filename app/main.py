from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.services.qa import answer_with_citations
from app.config import FRONTEND_ORIGINS

app = FastAPI(title="Tech Fault RAG Bot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
