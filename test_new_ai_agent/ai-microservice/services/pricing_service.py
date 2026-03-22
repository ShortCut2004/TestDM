import os
import time
from typing import Dict, Tuple

import asyncio
import httpx

_PRICING_CACHE: Dict[str, Dict[str, float]] = {}
_PRICING_LAST_FETCH: float | None = None


def _get_ttl_seconds() -> int:
    try:
        return int(os.environ.get("OPENROUTER_PRICING_TTL_SECONDS", "21600"))
    except ValueError:
        return 21600


async def _fetch_pricing_from_openrouter() -> None:
    global _PRICING_CACHE, _PRICING_LAST_FETCH

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return

    url = os.environ.get("OPENROUTER_MODELS_URL", "https://openrouter.ai/api/v1/models")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return

    models = data.get("data") or []
    new_cache: Dict[str, Dict[str, float]] = {}

    for m in models:
        name = m.get("id") or m.get("name")
        if not name:
            continue
        pricing = m.get("pricing") or {}
        input_price = pricing.get("prompt") or pricing.get("input") or 0.0
        output_price = pricing.get("completion") or pricing.get("output") or 0.0
        if input_price or output_price:
            new_cache[name] = {
                "input": float(input_price),
                "output": float(output_price),
            }

    if new_cache:
        _PRICING_CACHE = new_cache
        _PRICING_LAST_FETCH = time.time()


def _hardcoded_pricing(model: str) -> Tuple[float, float]:
    table: Dict[str, Tuple[float, float]] = {
        "anthropic/claude-sonnet-4.5": (3.0, 15.0),
        "anthropic/claude-3.5-sonnet": (3.0, 15.0),
        "anthropic/claude-haiku-4.5": (0.8, 4.0),
        "anthropic/claude-3-haiku": (0.8, 4.0),
    }
    if model in table:
        return table[model]
    return table["anthropic/claude-sonnet-4.5"]


async def _ensure_pricing_cache() -> None:
    ttl = _get_ttl_seconds()
    now = time.time()
    if _PRICING_LAST_FETCH is None or (now - _PRICING_LAST_FETCH) > ttl:
        await _fetch_pricing_from_openrouter()


def _get_cached_pricing(model: str) -> Tuple[float, float]:
    info = _PRICING_CACHE.get(model)
    if info:
        return float(info.get("input") or 0.0), float(info.get("output") or 0.0)
    return _hardcoded_pricing(model)


def calculate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_ensure_pricing_cache())
    except RuntimeError:
        pass
    except Exception:
        pass

    input_price, output_price = _get_cached_pricing(model)
    cost_input = (prompt_tokens / 1_000_000) * input_price
    cost_output = (completion_tokens / 1_000_000) * output_price
    return round(cost_input + cost_output, 6)