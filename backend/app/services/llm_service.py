"""LLM service — communicates with local Ollama / vLLM instance.

Optimized for 200+ concurrent users with a persistent connection pool.
"""

import logging
import time
import hashlib
from typing import AsyncGenerator

import httpx
import orjson

from app.config import settings

logger = logging.getLogger(__name__)

# Persistent connection pool — shared across all requests.
# max_connections=250 allows 200+ concurrent chat streams + headroom.
# max_keepalive_connections keeps warm sockets ready for reuse.
_limits = httpx.Limits(
    max_connections=250,
    max_keepalive_connections=100,
    keepalive_expiry=300,  # 5 minutes to handle bursty workloads
)


class LLMService:
    """Handles communication with the local LLM runtime (Ollama)."""

    def __init__(self):
        self.base_url = settings.LLM_BASE_URL
        self.default_model = settings.LLM_DEFAULT_MODEL
        self.timeout = settings.LLM_TIMEOUT
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE
        self.num_ctx = settings.LLM_NUM_CTX
        self.num_gpu = settings.LLM_NUM_GPU
        self.num_thread = settings.LLM_NUM_THREAD
        self._model_cache: list[str] = []
        self._model_cache_ts: float = 0.0
        self._model_cache_ttl_seconds = 30.0
        self._prompt_cache: dict[str, tuple[float, str]] = {}
        # Persistent async client — reuses TCP connections across requests
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(
                connect=10.0,
                read=float(self.timeout),
                write=30.0,
                pool=15.0,
            ),
            limits=_limits,
        )

    async def reload(self):
        """Reload config from in-memory settings and recreate the HTTP client."""
        new_base = settings.LLM_BASE_URL
        new_timeout = settings.LLM_TIMEOUT
        needs_new_client = (new_base != self.base_url or new_timeout != self.timeout)

        self.base_url = new_base
        self.default_model = settings.LLM_DEFAULT_MODEL
        self.timeout = new_timeout
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE
        self.num_ctx = settings.LLM_NUM_CTX
        self.num_gpu = settings.LLM_NUM_GPU
        self.num_thread = settings.LLM_NUM_THREAD

        if needs_new_client:
            await self._client.aclose()
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(
                    connect=10.0,
                    read=float(self.timeout),
                    write=30.0,
                    pool=15.0,
                ),
                limits=_limits,
            )
            logger.info("LLM client recreated: base_url=%s", self.base_url)

    def _build_options(self) -> dict:
        """Build Ollama options dict with performance-tuned parameters."""
        opts: dict = {
            "num_predict": self.max_tokens,
            "temperature": self.temperature,
            "num_ctx": self.num_ctx,
        }
        if self.num_gpu != -1:
            opts["num_gpu"] = self.num_gpu
        if self.num_thread > 0:
            opts["num_thread"] = self.num_thread
        return opts

    def _build_options_with_overrides(
        self,
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> dict:
        opts = self._build_options()
        if max_tokens is not None and max_tokens > 0:
            opts["num_predict"] = max_tokens
        if temperature is not None:
            opts["temperature"] = temperature
        return opts

    async def _get_available_model_names(self) -> list[str]:
        now = time.monotonic()
        if self._model_cache and (now - self._model_cache_ts) < self._model_cache_ttl_seconds:
            return self._model_cache

        try:
            models = await self.list_models()
            names = [m.get("name", "") for m in models if m.get("name")]
            self._model_cache = names
            self._model_cache_ts = now
            return names
        except Exception:
            return self._model_cache

    async def resolve_model(
        self,
        messages: list[dict],
        requested_model: str | None,
        deep_analysis: bool = False,
    ) -> tuple[str, str]:
        """Pick a model based on explicit selection or lightweight task routing."""
        if requested_model:
            return requested_model, "user_selected"

        if not settings.LLM_ENABLE_ROUTING:
            return self.default_model, "routing_disabled"

        available = await self._get_available_model_names()
        available_set = set(available)

        if deep_analysis:
            return self.default_model, "deep_analysis_default"

        user_text = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_text = (msg.get("content") or "").lower()
                break

        is_complex = any(k in user_text for k in settings.LLM_COMPLEX_TASK_KEYWORDS)
        if len(user_text) > 1200:
            is_complex = True

        if is_complex:
            return self.default_model, "complex_task_default"

        for candidate in settings.LLM_SMALL_MODEL_CANDIDATES:
            if candidate in available_set:
                return candidate, "fast_path_small_model"

        return self.default_model, "fallback_default"

    async def get_fast_model_candidate(self) -> str | None:
        available = await self._get_available_model_names()
        available_set = set(available)
        for candidate in settings.LLM_SMALL_MODEL_CANDIDATES:
            if candidate in available_set:
                return candidate
        return None

    def _prepare_messages(self, messages: list[dict], vision_images: list[str] | None = None) -> list[dict]:
        """Attach vision images to the latest user turn when provided."""
        if not vision_images:
            return messages

        payload_msgs = [dict(m) for m in messages]
        for idx in range(len(payload_msgs) - 1, -1, -1):
            if payload_msgs[idx].get("role") == "user":
                payload_msgs[idx]["images"] = vision_images
                return payload_msgs
        return payload_msgs

    def _cache_key(self, *, model: str, messages: list[dict], max_tokens: int | None, temperature: float | None) -> str:
        payload = orjson.dumps(
            {
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
            option=orjson.OPT_SORT_KEYS,
        )
        return hashlib.blake2b(payload, digest_size=16).hexdigest()

    def _cache_get(self, key: str) -> str | None:
        if not settings.LLM_PROMPT_CACHE_ENABLED:
            return None
        item = self._prompt_cache.get(key)
        if not item:
            return None
        ts, value = item
        if (time.monotonic() - ts) > settings.LLM_PROMPT_CACHE_TTL_SECONDS:
            self._prompt_cache.pop(key, None)
            return None
        return value

    def _cache_set(self, key: str, value: str):
        if not settings.LLM_PROMPT_CACHE_ENABLED:
            return
        self._prompt_cache[key] = (time.monotonic(), value)
        if len(self._prompt_cache) > 500:
            # Drop oldest ~20% entries to cap memory.
            oldest = sorted(self._prompt_cache.items(), key=lambda kv: kv[1][0])[:100]
            for k, _ in oldest:
                self._prompt_cache.pop(k, None)

    async def generate(
        self,
        messages: list[dict],
        model: str | None = None,
        stream: bool = False,
        vision_images: list[str] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> str:
        """Send messages to the LLM and return the full response."""
        model = model or self.default_model
        payload_messages = self._prepare_messages(messages, vision_images=vision_images)

        cache_key = None
        if not vision_images:
            cache_key = self._cache_key(
                model=model,
                messages=payload_messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached

        response = await self._client.post(
            "/api/chat",
            json={
                "model": model,
                "messages": payload_messages,
                "stream": False,
                "options": self._build_options_with_overrides(
                    max_tokens=max_tokens,
                    temperature=temperature,
                ),
            },
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        if cache_key:
            self._cache_set(cache_key, content)
        return content

    async def generate_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        vision_images: list[str] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from the LLM."""
        model = model or self.default_model
        payload_messages = self._prepare_messages(messages, vision_images=vision_images)

        async with self._client.stream(
            "POST",
            "/api/chat",
            json={
                "model": model,
                "messages": payload_messages,
                "stream": True,
                "options": self._build_options(),
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    data = orjson.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done", False):
                        break

    async def list_models(self) -> list[dict]:
        """List available models from the LLM runtime."""
        try:
            response = await self._client.get("/api/tags", timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("models", [])
        except Exception as e:
            logger.error("Failed to list models: %s", str(e))
            return []

    async def health_check(self) -> bool:
        """Check if the LLM service is reachable."""
        try:
            response = await self._client.get("/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            return False

    async def show_model(self, name: str) -> dict | None:
        """Get detailed info about a specific model."""
        try:
            response = await self._client.post(
                "/api/show", json={"name": name}, timeout=15
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error("Failed to show model %s: %s", name, str(e))
            return None

    async def pull_model_stream(self, name: str):
        """Pull (download) a model from Ollama registry, yielding progress chunks."""
        async with self._client.stream(
            "POST",
            "/api/pull",
            json={"name": name, "stream": True},
            timeout=httpx.Timeout(connect=30.0, read=3600.0, write=30.0, pool=30.0),
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    yield line

    async def delete_model(self, name: str) -> bool:
        """Delete a model from Ollama."""
        try:
            response = await self._client.request(
                "DELETE", "/api/delete", json={"name": name}, timeout=30
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error("Failed to delete model %s: %s", name, str(e))
            return False

    async def close(self):
        """Close the persistent HTTP client."""
        await self._client.aclose()

    async def warm_pool(self):
        """Prime model runtime for lower first-token latency."""
        if not settings.LLM_WARM_POOL_ENABLED:
            return

        try:
            await self.generate(
                [
                    {"role": "system", "content": "Warmup request."},
                    {"role": "user", "content": settings.LLM_WARM_POOL_PROMPT},
                ],
                model=self.default_model,
                max_tokens=12,
                temperature=0.0,
            )
            logger.info("LLM warm pool primed for model=%s", self.default_model)
        except Exception as exc:
            logger.warning("LLM warm pool skipped: %s", exc)


llm_service = LLMService()
