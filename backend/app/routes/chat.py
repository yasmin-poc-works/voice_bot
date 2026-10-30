from fastapi import APIRouter, HTTPException

from app import llm
from app.config import settings
from app.guardrails import REFUSAL, is_prompt_injection, plain_text, validate_output
from app.persona import build_system_prompt, load_dossier, wrap_user_query
from app.schemas import ChatRequest, ChatResponse, Usage

router = APIRouter(prefix="/api")


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    # Layer 1: deterministic input filter, no LLM cost.
    if is_prompt_injection(req.message):
        return ChatResponse(reply=REFUSAL, status="REJECTED", category="INJECTION_ATTEMPT")

    # Layers 2-3: sandboxed user input + hardened, persona-locked prompt.
    system_prompt = build_system_prompt(req.history, req.message)
    user_content = wrap_user_query(req.message)

    try:
        result = await llm.generate(system_prompt, user_content)
    except llm.LLMBusy as busy:
        raise HTTPException(
            status_code=503,
            detail="The assistant is busy. Please try again in a few seconds.",
            headers={"Retry-After": str(int(busy.retry_after) + 1)},
        )
    except llm.LLMUnavailable:
        raise HTTPException(status_code=503, detail="The assistant is temporarily unavailable.")

    # Layer 4: output validator.
    safe = validate_output(result.reply, secret_values=[settings.groq_api_key])
    if safe is None:
        return ChatResponse(
            reply=REFUSAL,
            status="REJECTED",
            category="OUTPUT_BLOCKED",
            usage=Usage(total_tokens=result.total_tokens),
        )

    dossier = load_dossier()
    safe = plain_text(safe)  # no markdown: the reply is spoken aloud
    reply = safe.strip()
    if reply == dossier["boundary_message"].strip():
        status, category = "REJECTED", "OUT_OF_SCOPE_TRIVIA"
    elif reply == dossier["deflect_topics"]["message"].strip():
        status, category = "REJECTED", "DEFLECTED_TOPIC"
    else:
        status, category = "ACCEPTED", "ACCEPTED_INTERVIEW_QUERY"
    return ChatResponse(
        reply=safe,
        status=status,
        category=category,
        usage=Usage(total_tokens=result.total_tokens),
    )
