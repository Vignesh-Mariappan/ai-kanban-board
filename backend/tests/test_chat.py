import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.chat import ChatRequest, InvalidChatOutput, build_chat_prompt, parse_chat_output
from app.database import replace_board
from app.main import create_app
from app.openrouter import OpenRouterError
from app.schemas import BoardData

AUTH = ("user", "password")


class FakeChatProvider:
    def __init__(self, content: str | Exception) -> None:
        self.content = content
        self.prompts: list[str] = []
        self.json_modes: list[bool] = []

    def complete(self, prompt: str, *, json_mode: bool = False) -> str:
        self.prompts.append(prompt)
        self.json_modes.append(json_mode)
        if isinstance(self.content, Exception):
            raise self.content
        return self.content


def _client(tmp_path: Path, provider: FakeChatProvider) -> TestClient:
    app = create_app(database_path=tmp_path / "chat.sqlite3", chat_provider=provider)
    return TestClient(app)


def test_prompt_includes_board_question_and_conversation_history() -> None:
    board = {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-one"]},
            {"id": "col-discovery", "title": "Discovery", "cardIds": []},
            {"id": "col-progress", "title": "In Progress", "cardIds": []},
            {"id": "col-review", "title": "Review", "cardIds": []},
            {"id": "col-done", "title": "Done", "cardIds": []},
        ],
        "cards": {"card-one": {"id": "card-one", "title": "Task", "details": "Notes"}},
    }
    request = ChatRequest(
        question="Move the task",
        history=[{"role": "user", "content": "Add a task"}],
    )

    prompt = json.loads(build_chat_prompt(board, request))

    assert prompt["board"] == board
    assert prompt["question"] == "Move the task"
    assert prompt["history"] == [{"role": "user", "content": "Add a task"}]


def test_parse_chat_output_validates_optional_board_update() -> None:
    result = parse_chat_output('{"response":"No changes needed.","board_update":null}')

    assert result.response == "No changes needed."
    assert result.board_update is None


def test_chat_uses_database_board_and_persists_valid_update(tmp_path: Path) -> None:
    provider = FakeChatProvider(
        json.dumps(
            {
                "response": "I moved the task.",
                "board_update": {
                    "columns": [
                        {"id": "col-backlog", "title": "Updated Backlog", "cardIds": []},
                        {"id": "col-discovery", "title": "Discovery", "cardIds": []},
                        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-1"]},
                        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
                        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
                    ],
                    "cards": {
                        "card-1": {
                            "id": "card-1",
                            "title": "Align roadmap themes",
                            "details": "Draft quarterly themes with impact statements and metrics.",
                        },
                        "card-6": {
                            "id": "card-6",
                            "title": "QA micro-interactions",
                            "details": "Verify hover, focus, and loading states.",
                        },
                        "card-7": {
                            "id": "card-7",
                            "title": "Ship marketing page",
                            "details": "Final copy approved and asset pack delivered.",
                        },
                        "card-8": {
                            "id": "card-8",
                            "title": "Close onboarding sprint",
                            "details": "Document release notes and share internally.",
                        },
                    },
                },
            }
        )
    )
    with _client(tmp_path, provider) as client:
        original_board = client.get("/api/board", auth=AUTH).json()
        original_board["columns"][0]["title"] = "Updated Backlog"
        assert client.put("/api/board", auth=AUTH, json=original_board).status_code == 200

        response = client.post(
            "/api/chat",
            auth=AUTH,
            json={
                "question": "Move the roadmap task to In Progress",
                "history": [{"role": "user", "content": "We are prioritizing delivery."}],
            },
        )

        assert response.status_code == 200
        assert response.json() == {"response": "I moved the task.", "board_updated": True}
        prompt = json.loads(provider.prompts[0])
        assert prompt["board"]["columns"][0]["title"] == "Updated Backlog"
        assert prompt["question"] == "Move the roadmap task to In Progress"
        assert prompt["history"] == [
            {"role": "user", "content": "We are prioritizing delivery."}
        ]
        assert provider.json_modes == [True]
        saved = client.get("/api/board", auth=AUTH).json()
        assert saved["columns"][2]["cardIds"] == ["card-1"]
        assert saved["columns"][0]["title"] == "Updated Backlog"


def test_chat_without_update_preserves_board(tmp_path: Path) -> None:
    provider = FakeChatProvider('{"response":"Your board looks good."}')
    with _client(tmp_path, provider) as client:
        original = client.get("/api/board", auth=AUTH).json()
        response = client.post("/api/chat", auth=AUTH, json={"question": "Any advice?"})

        assert response.status_code == 200
        assert response.json() == {
            "response": "Your board looks good.",
            "board_updated": False,
        }
        assert client.get("/api/board", auth=AUTH).json() == original


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        '{"response":"Bad update","board_update":{"columns":[],"cards":{}}}',
    ],
)
def test_invalid_model_output_does_not_change_board(
    tmp_path: Path, content: str
) -> None:
    provider = FakeChatProvider(content)
    with _client(tmp_path, provider) as client:
        original = client.get("/api/board", auth=AUTH).json()

        response = client.post("/api/chat", auth=AUTH, json={"question": "Change the board"})

        assert response.status_code == 502
        assert response.json()["detail"] == "AI response was invalid"
        assert client.get("/api/board", auth=AUTH).json() == original


def test_provider_failure_does_not_change_board(tmp_path: Path) -> None:
    provider = FakeChatProvider(OpenRouterError("private provider details"))
    with _client(tmp_path, provider) as client:
        original = client.get("/api/board", auth=AUTH).json()

        response = client.post("/api/chat", auth=AUTH, json={"question": "Help"})

        assert response.status_code == 502
        assert response.json()["detail"] == "AI provider request failed"
        assert "private provider details" not in response.text
        assert client.get("/api/board", auth=AUTH).json() == original


def test_chat_update_is_rejected_when_board_changed_during_request(tmp_path: Path) -> None:
    database_path = tmp_path / "chat.sqlite3"

    class EditingProvider:
        def complete(self, prompt: str, *, json_mode: bool = False) -> str:
            board = json.loads(prompt)["board"]
            edited = json.loads(json.dumps(board))
            edited["columns"][0]["title"] = "Edited by the user"
            assert replace_board(database_path, "user", BoardData.model_validate(edited))
            board["columns"][1]["title"] = "Renamed by AI"
            return json.dumps({"response": "Renamed.", "board_update": board})

    app = create_app(database_path=database_path, chat_provider=EditingProvider())
    with TestClient(app) as client:
        response = client.post("/api/chat", auth=AUTH, json={"question": "Rename it"})

        assert response.status_code == 409
        saved = client.get("/api/board", auth=AUTH).json()
        assert saved["columns"][0]["title"] == "Edited by the user"
        assert saved["columns"][1]["title"] == "Discovery"


def test_chat_requires_authentication_and_valid_request(tmp_path: Path) -> None:
    provider = FakeChatProvider('{"response":"ok"}')
    with _client(tmp_path, provider) as client:
        assert client.post("/api/chat", json={"question": "Help"}).status_code == 401
        assert client.post(
            "/api/chat", auth=("other", "password"), json={"question": "Help"}
        ).status_code == 401
        assert client.post(
            "/api/chat", auth=AUTH, json={"question": "  "}
        ).status_code == 422
        assert provider.prompts == []


def test_chat_output_rejects_non_object_response() -> None:
    with pytest.raises(InvalidChatOutput):
        parse_chat_output('{"response":"   "}')
