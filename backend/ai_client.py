import os
import aiohttp
import json
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

# model aliases
MODELS = {
    "analyst":     "anthropic/claude-sonnet-4-5",   # briefs, debriefs
    "fast":        "google/gemini-2.0-flash-001",    # consequence gen, live events
    "optimizer":   "mistralai/mistral-7b-instruct",  # OPFOR reasoning, mutation
}

async def complete(
    prompt: str,
    model_key: str = "fast",
    max_tokens: int = 500,
    json_mode: bool = False
) -> str:
    model = MODELS[model_key]
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with aiohttp.ClientSession() as session:
        async with session.post(BASE_URL, headers=HEADERS, json=payload) as resp:
            data = await resp.json()
            return data["choices"][0]["message"]["content"]

async def complete_system(
    system: str,
    user: str,
    model_key: str = "analyst",
    max_tokens: int = 1000
) -> str:
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
            return data["choices"][0]["message"]["content"]