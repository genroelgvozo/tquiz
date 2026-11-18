def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_spa_served_when_static_dir_set(tmp_path, settings):
    from fastapi.testclient import TestClient

    from app.main import create_app

    (tmp_path / "static" / "assets").mkdir(parents=True)
    (tmp_path / "static" / "index.html").write_text("<div id=root></div>")
    s = settings.model_copy(update={"static_dir": tmp_path / "static"})
    with TestClient(create_app(s)) as c:
        for path in ("/play", "/screen", "/admin", "/admin/quiz/1"):
            assert "root" in c.get(path).text
        assert c.get("/api/health").json() == {"ok": True}
