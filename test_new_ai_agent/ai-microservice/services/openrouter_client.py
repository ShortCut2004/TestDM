import os
import json
import asyncio
from typing import Any, Dict, List, Optional

import httpx

from services.pricing_service import calculate_cost_usd


class OpenRouterClient:
    def __init__(self) -> None:
        self.api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        
        # Validate API key is present and looks valid
        if not self.api_key:
            print("[OpenRouterClient] WARNING: OPENROUTER_API_KEY is not set!")
            print("[OpenRouterClient] Set it with: export OPENROUTER_API_KEY=sk-or-v1-your-key-here")
        elif not self.api_key.startswith("sk-or-"):
            print(f"[OpenRouterClient] WARNING: OPENROUTER_API_KEY doesn't look like a valid OpenRouter key (should start with 'sk-or-')")

        self.base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.referer = os.environ.get("BASE_URL") or os.environ.get("HTTP_REFERER") or "http://localhost"
        self.title = os.environ.get("X_TITLE") or "SetterAI Microservice"
        
        # Retry configuration
        self.max_retries = int(os.environ.get("OPENROUTER_MAX_RETRIES", "3"))
        self.retry_delay = float(os.environ.get("OPENROUTER_RETRY_DELAY", "1.0"))
        self.timeout = float(os.environ.get("OPENROUTER_TIMEOUT", "60.0"))  # 60 sec per attempt

    async def chat(
        self,
        *,
        model: str,
        temperature: float,
        messages: List[Dict[str, Any]],
        title: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": self.referer,
            "X-Title": title or self.title,
        }

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        last_error: Optional[Exception] = None
        
        for attempt in range(self.max_retries):
            try:
                # Timeout config with generous limits for AI responses
                timeout_config = httpx.Timeout(
                    connect=10.0,
                    read=self.timeout,
                    write=10.0,
                    pool=5.0
                )
                
                async with httpx.AsyncClient(timeout=timeout_config) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                
                # If we get a response, break out of retry loop
                break
                
            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    # Wait before retrying with exponential backoff
                    wait_time = self.retry_delay * (2 ** attempt)
                    print(f"[OpenRouterClient] Timeout on attempt {attempt + 1}/{self.max_retries}, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    raise RuntimeError(
                        f"OpenRouter request timed out after {self.max_retries} attempts. "
                        f"The AI service may be temporarily slow. Please try again."
                    ) from e
                    
            except httpx.ConnectError as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delay * (2 ** attempt)
                    print(f"[OpenRouterClient] Connection error on attempt {attempt + 1}/{self.max_retries}, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    raise RuntimeError(
                        f"Could not connect to OpenRouter after {self.max_retries} attempts. "
                        f"Please check your internet connection and try again."
                    ) from e
                    
            except Exception as e:
                # For other errors, don't retry
                raise RuntimeError(f"OpenRouter request failed: {str(e)}") from e

        try:
            data = resp.json()
        except Exception:
            raise RuntimeError(f"OpenRouter returned non-JSON response (status {resp.status_code})")

        if resp.status_code >= 400 or data.get("error"):
            detail = data.get("error", {}).get("message") if isinstance(data.get("error"), dict) else data.get("error")
            
            # Provide helpful error messages for common issues
            if resp.status_code == 401:
                if not self.api_key:
                    raise RuntimeError(
                        "OPENROUTER_API_KEY is not set. "
                        "Get your key from https://openrouter.ai/keys and set it with: "
                        "export OPENROUTER_API_KEY=sk-or-v1-your-key-here"
                    )
                raise RuntimeError(
                    f"OpenRouter authentication failed (401). Your API key may be invalid or expired. "
                    f"Check your key at https://openrouter.ai/keys. Error: {detail or 'User not found'}"
                )
            
            raise RuntimeError(f"OpenRouter error ({resp.status_code}): {detail or data}")

        choice = (data.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content", "") or ""

        usage_raw = data.get("usage") or {}
        prompt_tokens = int(usage_raw.get("prompt_tokens") or 0)
        completion_tokens = int(usage_raw.get("completion_tokens") or 0)
        total_tokens = int(usage_raw.get("total_tokens") or (prompt_tokens + completion_tokens))
        effective_model = data.get("model") or model
        cost_usd = calculate_cost_usd(effective_model, prompt_tokens, completion_tokens)

        usage = {
            "model": effective_model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cost_usd": cost_usd,
        }

        return {"content": content.strip(), "usage": usage}
