import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(admin_password="test", secret_key="k", public_url="http://quiz.test", data_dir=tmp_path)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def admin_client(client):
    assert client.post("/api/auth/login", json={"password": "test"}).status_code == 204
    return client
