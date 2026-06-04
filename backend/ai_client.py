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
    "analyst": ["anthropic/claude-sonnet-4-5"],
    "fast": [
        "google/gemini-2.5-flash",
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4-5",
    ],
    "optimizer": ["mistralai/mistral-7b-instruct"],
}


def models_for_key(model_key: str) -> list[str]:
    models = MODELS[model_key]
    return models if isinstance(models, list) else [models]


async def post_chat_completion(payload: dict, model_key: str) -> str:
    last_error = None

    async with aiohttp.ClientSession() as session:
        for model in models_for_key(model_key):
            payload = {**payload, "model": model}
            async with session.post(BASE_URL, headers=HEADERS, json=payload) as resp:
                data = await resp.json()
                print(f"[LLM] status: {resp.status}, model: {model}")
                if "error" in data:
                    last_error = data["error"]
                    print(f"[LLM] error from API: {last_error}")
                    continue
                content = data["choices"][0]["message"]["content"]
                print(f"[LLM] raw: {content[:200]}")
                return content

    raise ValueError(last_error or f"No models available for key: {model_key}")

async def complete(
    prompt: str,
    model_key: str = "fast",
    max_tokens: int = 500,
    json_mode: bool = False      # kept for compatibility but handled differently
) -> str:
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")

    payload = {
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }

    return await post_chat_completion(payload, model_key)

async def complete_system(
    system: str,
    user: str,
    model_key: str = "analyst",
    max_tokens: int = 1000
) -> str:
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not set")

    payload = {
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
    }

    return await post_chat_completion(payload, model_key)
