"""LLM service — communicates with local Ollama / vLLM instance.

Optimized for 200+ concurrent users with a persistent connection pool.
"""

import logging
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

    async def generate(
        self,
        messages: list[dict],
        model: str | None = None,
        stream: bool = False,
    ) -> str:
        """Send messages to the LLM and return the full response."""
        model = model or self.default_model

        response = await self._client.post(
            "/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": self._build_options(),
            },
        )
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "")

    async def generate_stream(
        self,
        messages: list[dict],
        model: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from the LLM."""
        model = model or self.default_model

        async with self._client.stream(
            "POST",
            "/api/chat",
            json={
                "model": model,
                "messages": messages,
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


llm_service = LLMService()
