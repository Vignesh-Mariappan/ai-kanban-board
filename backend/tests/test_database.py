from pathlib import Path

from app.database import initialize_database, load_board, replace_board
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