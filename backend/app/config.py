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
        default_factory=lambda: _env("PIPELINE_MODEL", "deepinfra/nvidia/NVIDIA-Nemotron-Nano-9B-v2")
    )
    collect_model: str = field(
        default_factory=lambda: _env(
            "COLLECT_MODEL",
            _env("PIPELINE_MODEL", "deepinfra/nvidia/NVIDIA-Nemotron-Nano-9B-v2"),
        )
    )
    disambiguate_model: str = field(
        default_factory=lambda: _env(
            "DISAMBIGUATE_MODEL",
            _env("PIPELINE_MODEL", "deepinfra/nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning"),
        )
    )
    synthesize_model: str = field(
        default_factory=lambda: _env(
            "SYNTHESIZE_MODEL",
            _env("PIPELINE_MODEL", "deepinfra/nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning"),
        )
    )
    embedding_model: str = field(
        default_factory=lambda: _env("EMBEDDING_MODEL", "deepinfra/nvidia/llama-3.2-nv-embedqa-1b-v2")
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
        default_factory=lambda: _env("DEEPINFRA_REASONING_MODEL", "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning")
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
    frontend_public_url: str = field(
        default_factory=lambda: _env("FRONTEND_PUBLIC_URL", _env("PUBLIC_APP_URL", "http://localhost:4321"))
    )
    google_oauth_client_id: str | None = field(
        default_factory=lambda: _env("GOOGLE_OAUTH_CLIENT_ID")
    )
    google_oauth_client_secret: str | None = field(
        default_factory=lambda: _env("GOOGLE_OAUTH_CLIENT_SECRET")
    )
    google_oauth_redirect_uri: str | None = field(
        default_factory=lambda: _env("GOOGLE_OAUTH_REDIRECT_URI")
    )
    gmail_token_encryption_key: str | None = field(
        default_factory=lambda: _env("GMAIL_TOKEN_ENCRYPTION_KEY")
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
    app_env: str = field(
        default_factory=lambda: _env("APP_ENV", _env("ENVIRONMENT", "development"))
    )
    strict_embedding_provider_validation: bool = field(
        default_factory=lambda: _env("STRICT_EMBEDDING_PROVIDER_VALIDATION", "false").lower() == "true"
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

    @property
    def has_google_oauth(self) -> bool:
        return bool(self.google_oauth_client_id and self.google_oauth_client_secret)

    @property
    def has_gmail_token_encryption(self) -> bool:
        return bool(self.gmail_token_encryption_key)

    def validate_ai_model_providers(self) -> None:
        """Keep production agent routing on the approved DeepInfra/NVIDIA path."""
        disallowed = ("anthropic", "claude", "gemini")
        model_fields = {
            "PIPELINE_MODEL": self.pipeline_model,
            "COLLECT_MODEL": self.collect_model,
            "DISAMBIGUATE_MODEL": self.disambiguate_model,
            "SYNTHESIZE_MODEL": self.synthesize_model,
            "DEEPINFRA_EXTRACTION_MODEL": self.deepinfra_extraction_model,
            "DEEPINFRA_REASONING_MODEL": self.deepinfra_reasoning_model,
            "DEEPINFRA_PREMIUM_MODEL": self.deepinfra_premium_model,
            "DEEPINFRA_FALLBACK_MODEL": self.deepinfra_fallback_model,
        }
        if self.strict_embedding_provider_validation or self.app_env.lower() == "production":
            model_fields["EMBEDDING_MODEL"] = self.embedding_model
        offenders = [
            f"{name}={value}"
            for name, value in model_fields.items()
            if value and any(term in value.lower() for term in disallowed)
        ]
        if offenders:
            raise RuntimeError(
                "USDWatch AI model routing must not use Gemini, Anthropic, or Claude: "
                + "; ".join(offenders)
            )


settings = Settings()
settings.validate_ai_model_providers()
