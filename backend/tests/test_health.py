import sys
import types
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jwt import ExpiredSignatureError, InvalidTokenError
from jwt.exceptions import PyJWKClientConnectionError

import app.main as main_module
from app.api import deps
from app.api.deps import get_current_user
from app.config import Settings
from app.main import app

client = TestClient(app)


def _user(workspace_id: str | None = None, role: str = "member") -> dict:
    wid = workspace_id or f"w-{uuid.uuid4().hex[:8]}"
    return {
        "id": f"u-{uuid.uuid4().hex[:8]}",
        "clerk_user_id": f"user_{uuid.uuid4().hex[:8]}",
        "email": f"{wid}@example.com",
        "role": role,
        "workspace_id": wid,
        "workspace": {
            "id": wid,
            "name": f"{wid} workspace",
            "type": "personal",
            "plan": "free" if role != "admin" else "admin",
            "owner_user_id": "",
            "clerk_org_id": "",
        },
        "plan": "free" if role != "admin" else "admin",
    }


@pytest.fixture(autouse=True)
def clear_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _override_user(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["agent_runtime"] == "agno"


def test_protected_routes_require_auth():
    resp = client.get("/api/profiles")
    assert resp.status_code == 401


def test_seed_requires_admin_role(monkeypatch):
    calls = {"seed": 0, "ingest": 0}

    def fake_seed():
        calls["seed"] += 1

    def fake_ingest():
        calls["ingest"] += 1

    fake_seed_module = types.ModuleType("app.scripts.seed_actors")
    fake_seed_module.seed = fake_seed
    monkeypatch.setitem(sys.modules, "app.scripts.seed_actors", fake_seed_module)
    monkeypatch.setattr(main_module, "_ingest_evidence_to_qdrant", fake_ingest)

    _override_user(_user(role="member"))
    denied = client.post("/api/seed")
    assert denied.status_code == 403
    assert calls == {"seed": 0, "ingest": 0}

    _override_user(_user(role="admin"))
    allowed = client.post("/api/seed")
    assert allowed.status_code == 200
    assert calls == {"seed": 1, "ingest": 1}


def test_model_diagnostics_requires_admin_and_redacts_provider_keys():
    _override_user(_user(role="member"))
    denied = client.get("/api/admin/model-diagnostics")
    assert denied.status_code == 403

    _override_user(_user(role="admin"))
    allowed = client.get("/api/admin/model-diagnostics")
    assert allowed.status_code == 200
    data = allowed.json()
    assert data["agent_runtime"] == "agno"
    assert data["models"]["embedding"]
    assert data["vector_store"]["qdrant_vector_size"] == 3072
    assert data["retrieval_evaluation"]["recommended_first_candidate"] == "isaacus/kanon-2-embedder"
    assert data["retrieval_evaluation"]["requires_reindex_before_switch"] is True
    kanon = next(item for item in data["legal_embedding_candidates"] if item["model"] == "isaacus/kanon-2-embedder")
    assert kanon["dimensions_match_current_collection"] is False
    assert "legal retrieval benchmark" in " ".join(kanon["rationale"]).lower()
    assert "api_key" not in str(data).lower()
    assert "secret" not in str(data).lower()


def test_document_insight_backfill_requires_admin_and_skips_ready_docs(monkeypatch):
    from app.api._store import case_documents
    from app.models import CaseDocument

    pending = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id="insight-admin",
        filename="pending.txt",
        extracted_text="The school acknowledged an injury and follow-up communication.",
        insight_status="pending",
    )
    ready = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id="insight-admin",
        filename="ready.txt",
        extracted_text="Already summarized.",
        document_summary="Existing summary",
        case_relevance="Existing relevance",
        insight_status="ready",
    )
    case_documents[pending.id] = pending
    case_documents[ready.id] = ready

    _override_user(_user(role="member"))
    denied = client.post("/api/admin/document-insights/backfill")
    assert denied.status_code == 403

    _override_user(_user(workspace_id="insight-admin", role="admin"))
    allowed = client.post("/api/admin/document-insights/backfill", json={"limit": 10})
    assert allowed.status_code == 200
    data = allowed.json()
    assert data["processed"] == 1
    assert data["skipped_ready"] >= 1
    assert case_documents[pending.id].insight_status in {"ready", "skipped"}
    assert case_documents[ready.id].document_summary == "Existing summary"


def test_backfill_can_target_ready_docs_missing_relevance_metadata(monkeypatch):
    from app.api._store import case_documents
    from app.models import CaseDocument
    from app.scripts import backfill_document_insights as backfill_script

    workspace_id = f"missing-rel-{uuid.uuid4().hex[:6]}"
    missing = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=workspace_id,
        filename="ready-missing-relevance.txt",
        extracted_text="Already summarized, but missing deterministic relevance metadata.",
        document_summary="Existing summary",
        case_relevance="Existing relevance",
        insight_status="ready",
    )
    complete = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=workspace_id,
        filename="ready-complete.txt",
        extracted_text="Already complete.",
        document_summary="Existing summary",
        case_relevance="Existing relevance",
        insight_status="ready",
        evidence_role="supporting_context",
        relevance_model="deterministic:evidence-relevance-v1",
    )
    case_documents[missing.id] = missing
    case_documents[complete.id] = complete

    def fake_generate(doc, case=None, *, force=False):
        assert force is True
        doc.evidence_role = "supporting_context"
        doc.relevance_model = "deterministic:evidence-relevance-v1"
        doc.insight_status = "ready"
        return doc

    monkeypatch.setattr(backfill_script, "generate_document_insight", fake_generate)
    result = backfill_script.backfill_document_insights(
        limit=10,
        only_missing_relevance=True,
        workspace_id=workspace_id,
    )

    assert result["candidate_total"] == 1
    assert result["processed"] == 1
    assert case_documents[missing.id].relevance_model == "deterministic:evidence-relevance-v1"


def test_metadata_backfill_assigns_categories_from_legacy_evidence_types(monkeypatch):
    from app.api._store import case_documents
    from app.models import CaseDocument
    from app.scripts import backfill_document_metadata as metadata_backfill

    workspace_id = f"metadata-{uuid.uuid4().hex[:6]}"
    incident = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=workspace_id,
        filename="Critical Incident Liam Crowley 4-3-26_Redacted.pdf",
        evidence_type="critical_incident",
        inferred_category="",
        extracted_text="Critical incident report involving supervision and injury.",
    )
    case_documents[incident.id] = incident

    result = metadata_backfill.backfill_document_metadata(
        limit=10,
        workspace_id=workspace_id,
    )

    assert result["processed"] == 1
    assert result["updated_metadata"] == 1
    assert case_documents[incident.id].inferred_category == "incident_safety"
    assert "incident_safety" in case_documents[incident.id].tags


def test_deepinfra_embedding_uses_openai_compatible_route(monkeypatch):
    from app.services import qdrant_client

    calls = {}

    class FakeSettings:
        embedding_model = "deepinfra/Qwen/Qwen3-Embedding-8B"
        deepinfra_api_key = "deepinfra-key"

    class FakeEmbeddings:
        def create(self, *, model, input, dimensions):
            calls["model"] = model
            calls["input"] = input
            calls["dimensions"] = dimensions
            return types.SimpleNamespace(
                data=[types.SimpleNamespace(embedding=[0.1] * dimensions)]
            )

    class FakeOpenAI:
        def __init__(self, *, api_key, base_url):
            calls["api_key"] = api_key
            calls["base_url"] = base_url
            self.embeddings = FakeEmbeddings()

    monkeypatch.setattr(qdrant_client, "settings", FakeSettings)
    monkeypatch.setitem(sys.modules, "openai", types.SimpleNamespace(OpenAI=FakeOpenAI))

    embedding = qdrant_client._embed_text("semantic evidence query")
    assert embedding == [0.1] * qdrant_client.VECTOR_SIZE
    assert calls["api_key"] == "deepinfra-key"
    assert calls["base_url"] == "https://api.deepinfra.com/v1/openai"
    assert calls["model"] == "Qwen/Qwen3-Embedding-8B"
    assert calls["input"] == ["semantic evidence query"]
    assert calls["dimensions"] == qdrant_client.VECTOR_SIZE


def test_qdrant_search_points_uses_query_points_when_search_is_missing():
    from app.services import qdrant_client

    calls = {}

    class FakeClient:
        def query_points(self, **kwargs):
            calls.update(kwargs)
            return types.SimpleNamespace(
                points=[
                    types.SimpleNamespace(payload={"document_id": "doc-1"}, score=0.82),
                ]
            )

    results = qdrant_client._search_points(
        FakeClient(),
        collection_name="documents",
        query_vector=[0.1] * qdrant_client.VECTOR_SIZE,
        query_filter="case-filter",
        limit=3,
        score_threshold=0.45,
    )

    assert results[0].payload["document_id"] == "doc-1"
    assert calls["collection_name"] == "documents"
    assert calls["query"] == [0.1] * qdrant_client.VECTOR_SIZE
    assert calls["query_filter"] == "case-filter"
    assert calls["limit"] == 3
    assert calls["score_threshold"] == 0.45


def test_job_not_found_for_authenticated_user():
    _override_user(_user())
    resp = client.get("/api/research/nonexistent")
    assert resp.status_code == 404


def test_dev_token_auth(monkeypatch):
    monkeypatch.setenv("ALLOW_DEV_AUTH", "true")
    claims = deps.verify_clerk_jwt("dev:parent@example.com")
    assert claims["sub"] == "dev_parent@example.com"
    assert claims["email"] == "parent@example.com"


def test_expired_and_invalid_clerk_tokens(monkeypatch):
    class FakeKey:
        key = "public-key"

    class FakeClient:
        def get_signing_key_from_jwt(self, _token):
            return FakeKey()

    monkeypatch.setenv("CLERK_JWKS_URL", "https://clerk.example.test/jwks")
    monkeypatch.setattr(deps, "_jwk_client", lambda _url: FakeClient())

    monkeypatch.setattr(deps.jwt, "decode", lambda *args, **kwargs: (_ for _ in ()).throw(ExpiredSignatureError()))
    with pytest.raises(HTTPException) as expired:
        deps.verify_clerk_jwt("expired")
    assert expired.value.status_code == 401
    assert "expired" in expired.value.detail

    monkeypatch.setattr(deps.jwt, "decode", lambda *args, **kwargs: (_ for _ in ()).throw(InvalidTokenError()))
    with pytest.raises(HTTPException) as invalid:
        deps.verify_clerk_jwt("invalid")
    assert invalid.value.status_code == 401
    assert "invalid" in invalid.value.detail


def test_clerk_jwks_connection_error_returns_service_unavailable(monkeypatch):
    class UnavailableClient:
        def get_signing_key_from_jwt(self, _token):
            raise PyJWKClientConnectionError("DNS lookup failed")

    monkeypatch.setenv("CLERK_JWKS_URL", "https://clerk.example.test/jwks")
    monkeypatch.setattr(deps, "_jwk_client", lambda _url: UnavailableClient())

    with pytest.raises(HTTPException) as unavailable:
        deps.verify_clerk_jwt("token")
    assert unavailable.value.status_code == 503
    assert "temporarily unavailable" in unavailable.value.detail


def test_model_provider_guard_rejects_disallowed_embedding_model(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("EMBEDDING_MODEL", "anthropic/legal-embed")
    with pytest.raises(RuntimeError) as exc:
        Settings().validate_ai_model_providers()
    assert "EMBEDDING_MODEL" in str(exc.value)
