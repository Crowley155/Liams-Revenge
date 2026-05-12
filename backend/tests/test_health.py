import sys
import types
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jwt import ExpiredSignatureError, InvalidTokenError

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
    assert data["vector_store"]["qdrant_vector_size"] == 2048
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


def test_model_provider_guard_rejects_disallowed_embedding_model(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("EMBEDDING_MODEL", "anthropic/legal-embed")
    with pytest.raises(RuntimeError) as exc:
        Settings().validate_ai_model_providers()
    assert "EMBEDDING_MODEL" in str(exc.value)
