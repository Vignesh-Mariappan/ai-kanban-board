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


def test_board_requires_valid_credentials(client: TestClient) -> None:
    assert client.get("/api/board").status_code == 401
    assert client.get("/api/board", auth=("user", "wrong")).status_code == 401
    assert client.get("/api/board", auth=("other", "password")).status_code == 401


def test_board_is_seeded_and_reads_in_saved_order(
    client: TestClient, database_path: Path
) -> None:
    response = client.get("/api/board", auth=AUTH)

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
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 2


def test_database_enforces_one_board_per_user(
    client: TestClient, database_path: Path
) -> None:
    with closing(sqlite3.connect(database_path)) as connection:
        user_id = connection.execute(
            "SELECT id FROM users WHERE username = 'user'"
        ).fetchone()[0]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO boards (id, user_id) VALUES (?, ?)",
                ("board-extra", user_id),
            )


def test_board_update_is_validated_and_persists_after_app_restart(
    database_path: Path,
) -> None:
    app = create_app(database_path=database_path)
    with TestClient(app) as client:
        board = client.get("/api/board", auth=AUTH).json()
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

        update = client.put("/api/board", auth=AUTH, json=board)
        assert update.status_code == 200
        assert update.json() == board

    restarted_app = create_app(database_path=database_path)
    with TestClient(restarted_app) as restarted_client:
        persisted = restarted_client.get("/api/board", auth=AUTH)
        assert persisted.status_code == 200
        assert persisted.json() == board


def test_invalid_card_membership_does_not_change_saved_board(client: TestClient) -> None:
    original = client.get("/api/board", auth=AUTH).json()
    invalid = json.loads(json.dumps(original))
    invalid["columns"][0]["cardIds"].append("card-3")

    response = client.put("/api/board", auth=AUTH, json=invalid)

    assert response.status_code == 422
    assert client.get("/api/board", auth=AUTH).json() == original