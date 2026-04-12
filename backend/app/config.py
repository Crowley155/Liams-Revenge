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

    langfuse_public_key: str | None = field(
        default_factory=lambda: os.getenv("LANGFUSE_PUBLIC_KEY")
    )
    langfuse_secret_key: str | None = field(
        default_factory=lambda: os.getenv("LANGFUSE_SECRET_KEY")
    )
    langfuse_host: str = field(
        default_factory=lambda: os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    )

    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8000")))

    @property
    def has_search_api(self) -> bool:
        return bool(self.serpapi_key or (self.google_cse_id and self.google_cse_api_key))

    @property
    def has_langfuse(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)


settings = Settings()
