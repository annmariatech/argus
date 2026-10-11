"""Server-side Groq chat proxy for Argus product and scam-safety support."""

import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/api/support", tags=["Support"])


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)


@router.post("/chat")
async def support_chat(data: ChatInput) -> dict[str, str]:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Support chat is not configured. Set GROQ_API_KEY on the API server.")
    import httpx

    messages = [{
        "role": "system",
        "content": (
            "You are Argus support. Reply in the same language as the user's latest message, including Malayalam. "
            "Explain how to use this QR risk assessment prototype and give "
            "general fintech scam-safety education. Be concise, practical, and calm. Never request "
            "UPI PINs, passwords, OTPs, card numbers, or full account details. Do not claim a QR is "
            "safe or a community hotspot is verified. For a suspected fraud, advise contacting the "
            "bank/payment provider immediately and using India's official cybercrime helpline 1930 "
            "or cybercrime.gov.in when applicable. This is not financial or legal advice."
        ),
    }]
    messages.extend(
        {"role": item["role"], "content": item["content"][:2000]}
        for item in data.history[-10:]
        if item.get("role") in {"user", "assistant"} and isinstance(item.get("content"), str)
    )
    messages.append({"role": "user", "content": data.message})
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"), "messages": messages, "temperature": 0.3, "max_tokens": 600},
            )
        response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Support chat timed out. Please try again.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="Support chat provider returned an error.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach the support chat provider.") from exc
    try:
        answer = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Support chat returned an unreadable response.") from exc
    return {"reply": answer}
