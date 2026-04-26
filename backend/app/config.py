from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str | None = None) -> str | None:
    """os.getenv that treats empty strings as unset."""
    val = os.getenv(key, default)
    return val if val else default


@dataclass(frozen=True)
class Settings:
    pipeline_model: str = field(
        default_factory=lambda: _env("PIPELINE_MODEL", "openai/gpt-4o-mini")
    )
    collect_model: str = field(
        default_factory=lambda: _env(
            "COLLECT_MODEL",
            _env("PIPELINE_MODEL", "gemini/gemini-2.5-flash-lite"),
        )
    )
    disambiguate_model: str = field(
        default_factory=lambda: _env(
            "DISAMBIGUATE_MODEL",
            _env("PIPELINE_MODEL", "gemini/gemini-2.5-flash"),
        )
    )
    synthesize_model: str = field(
        default_factory=lambda: _env(
            "SYNTHESIZE_MODEL",
            _env("PIPELINE_MODEL", "gemini/gemini-2.5-flash"),
        )
    )
    embedding_model: str = field(
        default_factory=lambda: _env("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    )

    serpapi_key: str | None = field(
        default_factory=lambda: _env("SERPAPI_KEY")
    )
    google_cse_id: str | None = field(
        default_factory=lambda: _env("GOOGLE_CSE_ID")
    )
    google_cse_api_key: str | None = field(
        default_factory=lambda: _env("GOOGLE_CSE_API_KEY")
    )

    qdrant_url: str | None = field(
        default_factory=lambda: _env("QDRANT_URL")
    )
    qdrant_api_key: str | None = field(
        default_factory=lambda: _env("QDRANT_API_KEY")
    )
    qdrant_collection: str = field(
        default_factory=lambda: _env("QDRANT_COLLECTION", "documents")
    )

    redis_url: str | None = field(
        default_factory=lambda: _env("REDIS_URL")
    )

    clerk_issuer: str | None = field(
        default_factory=lambda: _env("CLERK_ISSUER")
    )
    clerk_jwks_url: str | None = field(
        default_factory=lambda: _env("CLERK_JWKS_URL")
    )

    deepinfra_api_key: str | None = field(
        default_factory=lambda: _env("DEEPINFRA_API_KEY")
    )
    deepinfra_extraction_model: str = field(
        default_factory=lambda: _env("DEEPINFRA_EXTRACTION_MODEL", "nvidia/NVIDIA-Nemotron-Nano-9B-v2")
    )
    deepinfra_reasoning_model: str = field(
        default_factory=lambda: _env("DEEPINFRA_REASONING_MODEL", "nvidia/Nemotron-3-Nano-30B-A3B")
    )
    deepinfra_premium_model: str = field(
        default_factory=lambda: _env("DEEPINFRA_PREMIUM_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B")
    )
    deepinfra_fallback_model: str = field(
        default_factory=lambda: _env("DEEPINFRA_FALLBACK_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo")
    )
    enable_agent_os: bool = field(
        default_factory=lambda: _env("ENABLE_AGENT_OS", "false").lower() == "true"
    )

    pdl_api_key: str | None = field(
        default_factory=lambda: _env("PDL_API_KEY")
    )

    clay_api_key: str | None = field(
        default_factory=lambda: _env("CLAY_API_KEY")
    )
    clay_webhook_url: str | None = field(
        default_factory=lambda: _env("CLAY_WEBHOOK_URL")
    )
    backend_public_url: str | None = field(
        default_factory=lambda: _env("BACKEND_PUBLIC_URL")
    )

    langfuse_public_key: str | None = field(
        default_factory=lambda: _env("LANGFUSE_PUBLIC_KEY")
    )
    langfuse_secret_key: str | None = field(
        default_factory=lambda: _env("LANGFUSE_SECRET_KEY")
    )
    langfuse_host: str = field(
        default_factory=lambda: _env("LANGFUSE_HOST", "https://cloud.langfuse.com")
    )

    data_dir: str = field(
        default_factory=lambda: _env("DATA_DIR", "/app/data")
    )

    host: str = field(default_factory=lambda: _env("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(_env("PORT", "8000")))

    @property
    def has_search_api(self) -> bool:
        return bool(self.serpapi_key or (self.google_cse_id and self.google_cse_api_key))

    @property
    def has_langfuse(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    @property
    def has_pdl(self) -> bool:
        return bool(self.pdl_api_key)

    @property
    def has_clay(self) -> bool:
        return bool(self.clay_webhook_url)

    @property
    def has_qdrant(self) -> bool:
        return bool(self.qdrant_url)

    @property
    def has_redis(self) -> bool:
        return bool(self.redis_url)

    @property
    def has_deepinfra(self) -> bool:
        return bool(self.deepinfra_api_key)


settings = Settings()
