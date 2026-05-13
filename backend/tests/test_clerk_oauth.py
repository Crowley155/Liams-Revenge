from app.services.clerk_oauth import clerk_secret_key


def test_clerk_secret_key_removes_invisible_copy_paste_characters(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "\ufeff sk_live_\ufeffabc123\u200b \n")

    assert clerk_secret_key() == "sk_live_abc123"
