from app.auth import screen_key


def test_login_wrong_password(client):
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401


def test_login_sets_cookie_and_me(client):
    assert client.get("/api/auth/me").json() == {"admin": False}
    assert client.post("/api/auth/login", json={"password": "test"}).status_code == 204
    assert client.get("/api/auth/me").json() == {"admin": True}


def test_logout(admin_client):
    admin_client.post("/api/auth/logout")
    assert admin_client.get("/api/auth/me").json() == {"admin": False}


def test_screen_auth(client, settings):
    assert client.post("/api/screen/auth", json={"key": "bad"}).status_code == 403
    assert client.post("/api/screen/auth", json={"key": screen_key(settings)}).status_code == 204
    assert "tq_screen" in client.cookies
