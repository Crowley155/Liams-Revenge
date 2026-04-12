from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    pipeline_model: str = field(
        default_factory=lambda: os.getenv("PIPELINE_MODEL", "openai/gpt-4o-mini")
    )
    collect_model: str = field(
        default_factory=lambda: os.getenv(
            "COLLECT_MODEL",
            os.getenv("PIPELINE_MODEL", "gemini/gemini-2.5-flash-lite"),
        )
    )
    disambiguate_model: str = field(
        default_factory=lambda: os.getenv(
            "DISAMBIGUATE_MODEL",
            os.getenv("PIPELINE_MODEL", "gemini/gemini-2.5-flash"),
        )
    )
    synthesize_model: str = field(
        default_factory=lambda: os.getenv(
            "SYNTHESIZE_MODEL",
            os.getenv("PIPELINE_MODEL", "gemini/gemini-2.5-flash"),
        )
    )
    embedding_model: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-small")
    )

    serpapi_key: str | None = field(
        default_factory=lambda: os.getenv("SERPAPI_KEY")
    )
    google_cse_id: str | None = field(
        default_factory=lambda: os.getenv("GOOGLE_CSE_ID")
    )
    google_cse_api_key: str | None = field(
        default_factory=lambda: os.getenv("GOOGLE_CSE_API_KEY")
    )

    qdrant_url: str = field(
        default_factory=lambda: os.getenv("QDRANT_URL", "http://localhost:6333")
    )
    qdrant_api_key: str | None = field(
        default_factory=lambda: os.getenv("QDRANT_API_KEY")
    )
    qdrant_collection: str = field(
        default_factory=lambda: os.getenv("QDRANT_COLLECTION", "documents")
    )

    redis_url: str = field(
        default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379")
    )

    pdl_api_key: str | None = field(
        default_factory=lambda: os.getenv("PDL_API_KEY")
    )

    clay_api_key: str | None = field(
        default_factory=lambda: os.getenv("CLAY_API_KEY")
    )
    clay_webhook_url: str | None = field(
        default_factory=lambda: os.getenv("CLAY_WEBHOOK_URL")
    )
    backend_public_url: str | None = field(
        default_factory=lambda: os.getenv("BACKEND_PUBLIC_URL")
    )

    langfuse_public_key: str | None = field(
        default_factory=lambda: os.getenv("LANGFUSE_PUBLIC_KEY")
    )
    langfuse_secret_key: str | None = field(
        default_factory=lambda: os.getenv("LANGFUSE_SECRET_KEY")
    )
    langfuse_host: str = field(
        default_factory=lambda: os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    )

    data_dir: str = field(
        default_factory=lambda: os.getenv("DATA_DIR", "/app/data")
    )

    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8000")))

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


settings = Settings()
