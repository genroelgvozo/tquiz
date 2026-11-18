from app.auth import screen_key


def up(c, name, size=10):
    return c.post("/api/media", files={"file": (name, b"x" * size)})


def test_upload_image_and_fetch(admin_client):
    r = up(admin_client, "pic.png")
    body = r.json()
    assert r.status_code == 200 and body["kind"] == "image" and body["url"] == f"/media/{body['filename']}"
    assert admin_client.get(body["url"]).status_code == 200


def test_upload_uppercase_extension_ok(admin_client):
    assert up(admin_client, "IMG_0001.JPG").json()["filename"].endswith(".jpg")
    assert up(admin_client, "Song.MP3").json()["kind"] == "audio"


def test_upload_heic_rejected_with_hint(admin_client):
    r = up(admin_client, "IMG_0002.HEIC")
    assert r.status_code == 400 and "JPG" in r.json()["detail"]


def test_upload_too_large(admin_client):
    assert up(admin_client, "a.png", 10 * 1024 * 1024 + 1).status_code == 413


def test_media_requires_admin_or_screen(admin_client, client, settings):
    url = up(admin_client, "pic.png").json()["url"]
    admin_client.post("/api/auth/logout")
    assert client.get(url).status_code == 401
    client.post("/api/screen/auth", json={"key": screen_key(settings)})
    assert client.get(url).status_code == 200


def test_media_path_traversal_404(admin_client):
    assert admin_client.get("/media/..%2Ftquiz.db").status_code == 404
