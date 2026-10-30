from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.config import settings


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=settings.max_history_chars)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.max_message_chars)
    history: list[ChatMessage] = Field(default_factory=list)
    session_id: str = Field(min_length=1, max_length=64)

    @field_validator("message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be blank")
        return v

    @field_validator("history")
    @classmethod
    def trim_history(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        # History is client-controlled and untrusted: keep only the most recent messages.
        return v[-settings.max_history_messages :]


class Usage(BaseModel):
    total_tokens: int = 0


class ChatResponse(BaseModel):
    reply: str
    status: Literal["ACCEPTED", "REJECTED"]
    category: str
    usage: Usage = Usage()
