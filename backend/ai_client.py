import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://wraith.app",
    "X-Title": "WRAITH"
}

MODELS = {
    "analyst":   "anthropic/claude-sonnet-4-5",
    "fast":      "google/gemini-2.0-flash-001",
    "optimizer": "mistralai/mistral-7b-instruct",
}

async def complete(
    prompt: str,
    model_key: str = "fast",
    max_tokens: int = 500,
    json_mode: bool = False      # kept for compatibility but handled differently
) -> str:
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")

    model = MODELS[model_key]
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(BASE_URL, headers=HEADERS, json=payload) as resp:
            data = await resp.json()
            print(f"[LLM] status: {resp.status}, model: {model}")
            if "error" in data:
                print(f"[LLM] error from API: {data['error']}")
                raise ValueError(data["error"])
            content = data["choices"][0]["message"]["content"]
            print(f"[LLM] raw: {content[:200]}")
            return content

async def complete_system(
    system: str,
    user: str,
    model_key: str = "analyst",
    max_tokens: int = 1000
) -> str:
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")

    model = MODELS[model_key]
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(BASE_URL, headers=HEADERS, json=payload) as resp:
            data = await resp.json()
            if "error" in data:
                raise ValueError(data["error"])
            return data["choices"][0]["message"]["content"]
