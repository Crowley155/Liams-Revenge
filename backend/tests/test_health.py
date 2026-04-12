from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "model" in data


def test_list_profiles_empty():
    resp = client.get("/api/profiles")
    assert resp.status_code == 200
    assert resp.json() == []


def test_job_not_found():
    resp = client.get("/api/research/nonexistent")
    assert resp.status_code == 404
