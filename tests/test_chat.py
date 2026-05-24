import pytest

def test_general_chat_streaming(test_client, monkeypatch):
    """Test the /api/chat/general endpoint returns a successful chat response."""
    monkeypatch.setattr("api.routes.generate_chat_response", lambda *_args, **_kwargs: "Mocked reply")

    response = test_client.post(
        "/api/chat/general",
        json={
            "user_message": "Hello",
            "chat_history": [],
            "language": "en",
        },
    )

    assert response.status_code == 200
    assert response.json()["response"] == "Mocked reply"
