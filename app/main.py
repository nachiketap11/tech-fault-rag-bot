import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from app.services.qa import (
    answer_with_citations,
    build_citations_from_answer,
    prepare_answer_generation,
    stream_answer_text,
)
from app.config import FRONTEND_ORIGINS
from app.services.auth import (
    authenticate_user,
    create_access_token,
    create_user,
    get_current_user,
    initialize_auth_db,
    sanitize_user,
)
from app.services.history import (
    add_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    initialize_history_db,
    list_conversations,
    list_messages,
    update_conversation_title,
)

app = FastAPI(title="Tech Fault RAG Bot")
initialize_auth_db()
initialize_history_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=10)

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("Question is required")
        return question


class ConversationCreateRequest(BaseModel):
    title: str = "New chat"


class ConversationUpdateRequest(BaseModel):
    title: str


class AuthRequest(BaseModel):
    email: str
    password: str


@app.get("/")
def root():
    return {"message": "Tech Fault RAG Bot is running"}


@app.post("/auth/signup")
def signup(request: AuthRequest):
    try:
        user = create_user(request.email, request.password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {
        "user": sanitize_user(user),
        "access_token": create_access_token(user),
    }


@app.post("/auth/login")
def login(request: AuthRequest):
    user = authenticate_user(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "user": sanitize_user(user),
        "access_token": create_access_token(user),
    }


@app.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}


@app.get("/conversations")
def get_conversations(current_user: dict = Depends(get_current_user)):
    return {"conversations": list_conversations(current_user["id"])}


@app.post("/conversations")
def create_new_conversation(
    request: ConversationCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    return create_conversation(user_id=current_user["id"], title=request.title)


@app.get("/conversations/{conversation_id}")
def get_conversation_by_id(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


@app.patch("/conversations/{conversation_id}")
def update_conversation_by_id(
    conversation_id: str,
    request: ConversationUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    title = request.title.strip() or "New chat"
    update_conversation_title(conversation_id, current_user["id"], title)
    return get_conversation(conversation_id, current_user["id"])


@app.delete("/conversations/{conversation_id}")
def delete_conversation_by_id(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    delete_conversation(conversation_id, current_user["id"])
    return {"deleted": True, "conversation_id": conversation_id}


@app.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "conversation": conversation,
        "messages": list_messages(conversation_id),
    }


@app.post("/ask")
def ask_question(request: QuestionRequest, current_user: dict = Depends(get_current_user)):
    conversation = create_conversation(
        user_id=current_user["id"],
        title=request.question[:80].strip() or "New chat",
    )
    user_message = add_message(
        conversation_id=conversation["id"],
        role="user",
        content=request.question,
    )
    result = answer_with_citations(
        query=request.question,
        top_k=request.top_k,
    )
    assistant_message = add_message(
        conversation_id=conversation["id"],
        role="assistant",
        content=result["answer"],
        citations=result["citations"],
        retrieved_chunks=result["retrieved_chunks"],
    )
    updated_conversation = get_conversation(conversation["id"], current_user["id"])

    return {
        **result,
        "conversation": updated_conversation,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


@app.post("/conversations/{conversation_id}/messages")
def ask_question_in_conversation(
    conversation_id: str,
    request: QuestionRequest,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    previous_messages = list_messages(conversation_id)

    if not previous_messages:
        update_conversation_title(
            conversation_id,
            current_user["id"],
            request.question[:80].strip() or "New chat",
        )

    user_message = add_message(
        conversation_id=conversation_id,
        role="user",
        content=request.question,
    )

    result = answer_with_citations(
        query=request.question,
        top_k=request.top_k,
        conversation_messages=previous_messages,
    )

    assistant_message = add_message(
        conversation_id=conversation_id,
        role="assistant",
        content=result["answer"],
        citations=result["citations"],
        retrieved_chunks=result["retrieved_chunks"],
    )

    updated_conversation = get_conversation(conversation_id, current_user["id"])

    return {
        "conversation": updated_conversation,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


def _stream_event(event: dict) -> str:
    return f"{json.dumps(event)}\n"


@app.post("/conversations/{conversation_id}/messages/stream")
def stream_question_in_conversation(
    conversation_id: str,
    request: QuestionRequest,
    current_user: dict = Depends(get_current_user),
):
    conversation = get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    previous_messages = list_messages(conversation_id)

    if not previous_messages:
        update_conversation_title(
            conversation_id,
            current_user["id"],
            request.question[:80].strip() or "New chat",
        )

    user_message = add_message(
        conversation_id=conversation_id,
        role="user",
        content=request.question,
    )

    prompt, chunks = prepare_answer_generation(
        query=request.question,
        top_k=request.top_k,
        conversation_messages=previous_messages,
    )
    updated_conversation = get_conversation(conversation_id, current_user["id"])

    def generate():
        answer_parts = []

        yield _stream_event(
            {
                "type": "start",
                "conversation": updated_conversation,
                "user_message": user_message,
                "retrieved_chunks": chunks,
            }
        )

        try:
            for delta in stream_answer_text(prompt):
                answer_parts.append(delta)
                yield _stream_event({"type": "delta", "delta": delta})
        except Exception as error:
            yield _stream_event(
                {
                    "type": "error",
                    "detail": str(error) or "Something went wrong while streaming.",
                }
            )
            return

        answer_text = "".join(answer_parts)
        citations = build_citations_from_answer(answer_text, chunks)
        assistant_message = add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer_text,
            citations=citations,
            retrieved_chunks=chunks,
        )
        final_conversation = get_conversation(conversation_id, current_user["id"])

        yield _stream_event(
            {
                "type": "done",
                "conversation": final_conversation,
                "assistant_message": assistant_message,
            }
        )

    return StreamingResponse(generate(), media_type="application/x-ndjson")
