from contextlib import closing
from pathlib import Path
import sqlite3

import pytest

from app.database import (
    MIGRATIONS_DIRECTORY,
    BoardChangedError,
    create_board,
    create_user,
    delete_board,
    initialize_database,
    list_boards,
    load_board,
    replace_board,
    verify_user,
)
from app.schemas import BoardData


def first_board_id(database_path: Path, username: str = "user") -> str:
    return list_boards(database_path, username)[0]["id"]


def test_board_storage_preserves_column_and_card_order(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)
    board_id = first_board_id(database_path)
    board = load_board(database_path, "user", board_id)
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

    assert replace_board(database_path, "user", board_id, board_data)
    saved = load_board(database_path, "user", board_id)

    assert saved is not None
    assert saved["columns"][1]["cardIds"] == []
    assert saved["columns"][2]["cardIds"] == ["card-3", "card-4", "card-5"]


def test_boards_can_reuse_column_and_card_ids_independently(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path, username="user")
    initialize_database(database_path, username="alice")
    user_board = first_board_id(database_path)
    second_board = create_board(database_path, "user", "Second")["id"]
    board = load_board(database_path, "user", user_board)
    assert board is not None
    assert load_board(database_path, "alice", first_board_id(database_path, "alice")) == board

    assert replace_board(database_path, "user", second_board, BoardData.model_validate(board))
    board["cards"]["card-1"]["title"] = "Only on the first board"
    assert replace_board(database_path, "user", user_board, BoardData.model_validate(board))

    assert load_board(database_path, "user", second_board)["cards"]["card-1"]["title"] != (
        "Only on the first board"
    )
    assert load_board(database_path, "alice", user_board) is None
    assert not replace_board(database_path, "alice", user_board, BoardData.model_validate(board))


def test_deleting_a_board_removes_its_columns_and_cards(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)
    board_id = first_board_id(database_path)

    assert not delete_board(database_path, "other", board_id)
    assert delete_board(database_path, "user", board_id)

    assert list_boards(database_path, "user") == []
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("SELECT count(*) FROM columns").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM cards").fetchone()[0] == 0


def test_created_users_verify_only_with_their_password(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)

    assert create_user(database_path, "alice", "alice-password")
    assert not create_user(database_path, "alice", "another-password")

    assert verify_user(database_path, "alice", "alice-password")
    assert not verify_user(database_path, "alice", "another-password")
    assert not verify_user(database_path, "nobody", "alice-password")
    assert verify_user(database_path, "user", "password")
    assert [board["name"] for board in list_boards(database_path, "alice")] == ["My first board"]


def test_existing_version_one_board_is_preserved_by_migrations(tmp_path: Path) -> None:
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

    assert list_boards(database_path, "user") == [{"id": "board-1", "name": "Project board"}]
    assert verify_user(database_path, "user", "password")
    board = load_board(database_path, "user", "board-1")
    assert board is not None
    assert board["columns"][0]["title"] == "Renamed"
    assert board["columns"][4]["cardIds"] == ["card-a", "card-b"]
    assert board["cards"]["card-a"] == {"id": "card-a", "title": "First", "details": "Notes"}
    with closing(sqlite3.connect(database_path)) as connection:
        foreign_keys = connection.execute("PRAGMA foreign_key_list(columns)").fetchall()
        assert {row[2] for row in foreign_keys} == {"boards"}


def test_replace_board_rejects_a_board_that_changed_since_it_was_read(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.sqlite3"
    initialize_database(database_path)
    board_id = first_board_id(database_path)
    snapshot = load_board(database_path, "user", board_id)
    assert snapshot is not None
    changed = load_board(database_path, "user", board_id)
    changed["columns"][0]["title"] = "Edited meanwhile"
    assert replace_board(database_path, "user", board_id, BoardData.model_validate(changed))

    with pytest.raises(BoardChangedError):
        replace_board(
            database_path,
            "user",
            board_id,
            BoardData.model_validate(snapshot),
            expected_board=snapshot,
        )
    assert load_board(database_path, "user", board_id) == changed
