from contextlib import closing
from pathlib import Path
import sqlite3

import pytest

from app.database import (
    MIGRATIONS_DIRECTORY,
    BoardChangedError,
    initialize_database,
    load_board,
    replace_board,
)
from app.schemas import BoardData


def test_board_storage_preserves_column_and_card_order(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)
    board = load_board(database_path, "user")
    assert board is not None
    assert [column["id"] for column in board["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]

    payload = {"columns": board["columns"], "cards": board["cards"]}
    discovery = next(column for column in payload["columns"] if column["id"] == "col-discovery")
    progress = next(column for column in payload["columns"] if column["id"] == "col-progress")
    discovery["cardIds"].remove("card-3")
    progress["cardIds"].insert(0, "card-3")
    board_data = BoardData.model_validate(payload)

    assert replace_board(database_path, "user", board_data)
    saved = load_board(database_path, "user")

    assert saved is not None
    assert saved["columns"][1]["cardIds"] == []
    assert saved["columns"][2]["cardIds"] == ["card-3", "card-4", "card-5"]


def test_users_can_have_boards_with_identical_column_and_card_ids(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path, username="user")
    initialize_database(database_path, username="alice")
    board = load_board(database_path, "user")
    assert board is not None
    assert load_board(database_path, "alice") == board

    board["cards"]["card-1"]["title"] = "Only for user"
    assert replace_board(database_path, "user", BoardData.model_validate(board))

    assert load_board(database_path, "user")["cards"]["card-1"]["title"] == "Only for user"
    assert load_board(database_path, "alice")["cards"]["card-1"]["title"] != "Only for user"


def test_existing_version_one_board_is_preserved_by_migration(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    with closing(sqlite3.connect(database_path)) as connection:
        connection.executescript(
            (MIGRATIONS_DIRECTORY / "001_initial.sql").read_text(encoding="utf-8")
            + """
            INSERT INTO users VALUES ('user-1', 'user');
            INSERT INTO boards VALUES ('board-1', 'user-1');
            INSERT INTO columns VALUES
                ('col-backlog', 'board-1', 'Renamed', 0),
                ('col-discovery', 'board-1', 'Discovery', 1),
                ('col-progress', 'board-1', 'In Progress', 2),
                ('col-review', 'board-1', 'Review', 3),
                ('col-done', 'board-1', 'Done', 4);
            INSERT INTO cards VALUES
                ('card-b', 'col-done', 'Second', '', 1),
                ('card-a', 'col-done', 'First', 'Notes', 0);
            PRAGMA user_version = 1;
            """
        )

    initialize_database(database_path)

    board = load_board(database_path, "user")
    assert board is not None
    assert board["columns"][0]["title"] == "Renamed"
    assert board["columns"][4]["cardIds"] == ["card-a", "card-b"]
    assert board["cards"]["card-a"] == {"id": "card-a", "title": "First", "details": "Notes"}


def test_replace_board_rejects_a_board_that_changed_since_it_was_read(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)
    snapshot = load_board(database_path, "user")
    assert snapshot is not None
    changed = load_board(database_path, "user")
    changed["columns"][0]["title"] = "Edited meanwhile"
    assert replace_board(database_path, "user", BoardData.model_validate(changed))

    with pytest.raises(BoardChangedError):
        replace_board(
            database_path, "user", BoardData.model_validate(snapshot), expected_board=snapshot
        )
    assert load_board(database_path, "user") == changed
