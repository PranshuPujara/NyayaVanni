import pytest
from fastapi.testclient import TestClient
from api.routes import api_router
from main import app

@pytest.fixture
def client():
    app.include_router(api_router)
    return TestClient(app)


@pytest.fixture
def test_client(client):
    return client
