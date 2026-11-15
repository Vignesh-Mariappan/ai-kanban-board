from contextlib import closing
import json
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.database import DEFAULT_SEED_PATH
from app.main import PROJECT_ROOT, create_app

AUTH = ("user", "password")


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "kanban.sqlite3"


@pytest.fixture
def client(database_path: Path) -> TestClient:
    app = create_app(database_path=database_path)
    with TestClient(app) as test_client:
        yield test_client


def test_root_serves_static_kanban_page(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Kanban Studio" in response.text
    assert "_next/static/" in response.text


def test_frontend_static_asset_is_served(client: TestClient) -> None:
    static_root = PROJECT_ROOT / "frontend" / "out" / "_next" / "static"
    asset = next(static_root.rglob("*.js"), None)

    assert asset is not None
    asset_path = "/" + asset.relative_to(static_root.parents[1]).as_posix()
    response = client.get(asset_path)

    assert response.status_code == 200
    assert response.content


def test_health_route_reports_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_example_api_returns_hello_world(client: TestClient) -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, world!"}


def board_url(client: TestClient, auth: tuple[str, str] = AUTH) -> str:
    return f"/api/boards/{client.get('/api/boards', auth=auth).json()[0]['id']}"


def register(client: TestClient, username: str, password: str = "secret-pass") -> tuple[str, str]:
    response = client.post("/api/users", json={"username": username, "password": password})
    assert response.status_code == 201
    assert response.json() == {"username": username}
    return (username, password)


def test_board_routes_require_valid_credentials(client: TestClient) -> None:
    assert client.get("/api/boards").status_code == 401
    assert client.get("/api/boards", auth=("user", "wrong")).status_code == 401
    assert client.get("/api/boards", auth=("other", "password")).status_code == 401
    assert client.post("/api/boards", json={"name": "Nope"}).status_code == 401


def test_demo_board_is_seeded_and_reads_in_saved_order(
    client: TestClient, database_path: Path
) -> None:
    boards = client.get("/api/boards", auth=AUTH).json()
    assert [board["name"] for board in boards] == ["Project board"]

    response = client.get(f"/api/boards/{boards[0]['id']}", auth=AUTH)

    assert response.status_code == 200
    assert [column["id"] for column in response.json()["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert len(response.json()["cards"]) == 8
    assert database_path.is_file()
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 3
        password_hash = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'user'"
        ).fetchone()[0]
        assert "password" not in password_hash


def test_registered_user_signs_in_with_their_credentials_and_gets_an_empty_board(
    client: TestClient,
) -> None:
    alice = register(client, "alice")

    assert client.get("/api/boards", auth=("alice", "wrong-pass")).status_code == 401
    boards = client.get("/api/boards", auth=alice).json()
    assert [board["name"] for board in boards] == ["My first board"]
    board = client.get(f"/api/boards/{boards[0]['id']}", auth=alice).json()
    assert board["cards"] == {}
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]


def test_registration_rejects_taken_and_invalid_credentials(client: TestClient) -> None:
    register(client, "alice")

    taken = client.post("/api/users", json={"username": "alice", "password": "other-pass"})
    assert taken.status_code == 409
    assert taken.json()["detail"] == "That username is already taken"
    assert client.post("/api/users", json={"username": "user", "password": "password"}).status_code == 409
    for invalid in [
        {"username": "al", "password": "secret-pass"},
        {"username": "has space", "password": "secret-pass"},
        {"username": "has:colon", "password": "secret-pass"},
        {"username": "bob", "password": "short"},
    ]:
        assert client.post("/api/users", json=invalid).status_code == 422
    assert client.get("/api/boards", auth=("alice", "other-pass")).status_code == 401


def test_boards_can_be_created_renamed_and_deleted_with_separate_cards(
    client: TestClient,
) -> None:
    original_url = board_url(client)
    created = client.post("/api/boards", auth=AUTH, json={"name": "  Launch plan  "})
    assert created.status_code == 201
    launch = created.json()
    assert launch["name"] == "Launch plan"
    launch_url = f"/api/boards/{launch['id']}"
    assert [board["name"] for board in client.get("/api/boards", auth=AUTH).json()] == [
        "Project board",
        "Launch plan",
    ]

    launch_board = client.get(launch_url, auth=AUTH).json()
    assert launch_board["cards"] == {}
    launch_board["cards"]["card-1"] = {"id": "card-1", "title": "Launch task", "details": ""}
    launch_board["columns"][0]["cardIds"].append("card-1")
    assert client.put(launch_url, auth=AUTH, json=launch_board).json() == launch_board
    assert client.get(original_url, auth=AUTH).json()["cards"]["card-1"]["title"] == (
        "Align roadmap themes"
    )

    renamed = client.patch(launch_url, auth=AUTH, json={"name": "Launch"})
    assert renamed.json() == {"id": launch["id"], "name": "Launch"}
    assert client.patch(launch_url, auth=AUTH, json={"name": "   "}).status_code == 422

    assert client.delete(launch_url, auth=AUTH).status_code == 204
    assert client.get(launch_url, auth=AUTH).status_code == 404
    assert [board["name"] for board in client.get("/api/boards", auth=AUTH).json()] == [
        "Project board"
    ]


def test_users_cannot_access_each_others_boards(client: TestClient) -> None:
    alice = register(client, "alice")
    url = board_url(client)
    board = client.get(url, auth=AUTH).json()

    assert client.get(url, auth=alice).status_code == 404
    assert client.put(url, auth=alice, json=board).status_code == 404
    assert client.patch(url, auth=alice, json={"name": "Mine"}).status_code == 404
    assert client.delete(url, auth=alice).status_code == 404
    assert client.post(f"{url}/chat", auth=alice, json={"question": "Hi"}).status_code == 404
    assert [b["name"] for b in client.get("/api/boards", auth=alice).json()] == [
        "My first board"
    ]
    assert client.get(url, auth=AUTH).json() == board
    assert client.get("/api/boards/missing", auth=AUTH).status_code == 404


def test_board_update_is_validated_and_persists_after_app_restart(
    database_path: Path,
) -> None:
    app = create_app(database_path=database_path)
    with TestClient(app) as client:
        url = board_url(client)
        board = client.get(url, auth=AUTH).json()
        discovery = next(c for c in board["columns"] if c["id"] == "col-discovery")
        progress = next(c for c in board["columns"] if c["id"] == "col-progress")
        discovery["title"] = "Research"
        discovery["cardIds"].remove("card-3")
        progress["cardIds"].append("card-3")
        board["cards"]["card-3"]["title"] = "Updated analytics prototype"
        board["cards"]["card-3"]["details"] = "Revised notes"
        discovery["cardIds"].append("card-new")
        board["cards"]["card-new"] = {
            "id": "card-new",
            "title": "New research task",
            "details": "Created through the API",
        }

        update = client.put(url, auth=AUTH, json=board)
        assert update.status_code == 200
        assert update.json() == board
        alice = register(client, "alice")

    restarted_app = create_app(database_path=database_path)
    with TestClient(restarted_app) as restarted_client:
        persisted = restarted_client.get(url, auth=AUTH)
        assert persisted.status_code == 200
        assert persisted.json() == board
        assert restarted_client.get("/api/boards", auth=alice).status_code == 200


def test_invalid_card_membership_does_not_change_saved_board(client: TestClient) -> None:
    url = board_url(client)
    original = client.get(url, auth=AUTH).json()
    invalid = json.loads(json.dumps(original))
    invalid["columns"][0]["cardIds"].append("card-3")

    response = client.put(url, auth=AUTH, json=invalid)

    assert response.status_code == 422
    assert client.get(url, auth=AUTH).json() == original
