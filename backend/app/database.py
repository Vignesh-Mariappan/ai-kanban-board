from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from typing import Iterator
from uuid import uuid4

from app.passwords import hash_password, verify_password
from app.schemas import BoardData

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "kanban.sqlite3"
DEFAULT_SEED_PATH = PROJECT_ROOT / "docs" / "kanban-board.example.json"
MIGRATIONS_DIRECTORY = Path(__file__).resolve().parents[1] / "migrations"
SCHEMA_VERSION = 3
NEW_USER_BOARD_NAME = "My first board"
EMPTY_BOARD = BoardData.model_validate(
    {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": []},
            {"id": "col-discovery", "title": "Discovery", "cardIds": []},
            {"id": "col-progress", "title": "In Progress", "cardIds": []},
            {"id": "col-review", "title": "Review", "cardIds": []},
            {"id": "col-done", "title": "Done", "cardIds": []},
        ],
        "cards": {},
    }
)


class BoardChangedError(RuntimeError):
    pass


@contextmanager
def _connection(database_path: Path) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()


def initialize_database(
    database_path: Path,
    seed_path: Path = DEFAULT_SEED_PATH,
    username: str = "user",
    password: str = "password",
) -> None:
    """Apply migrations and make sure the demo user exists. A newly created demo
    user gets the example board; an existing user without a password gets one."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    seed_document = json.loads(seed_path.read_text(encoding="utf-8"))
    seed_json = seed_document["users"][0]["board"]
    seed_board = BoardData.model_validate(
        {"columns": seed_json["columns"], "cards": seed_json["cards"]}
    )

    with _connection(database_path) as connection:
        _apply_migrations(connection)
        connection.execute("BEGIN")
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            user_id = uuid4().hex
            connection.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (user_id, username, hash_password(password)),
            )
            _create_board(connection, user_id, "Project board", seed_board)
        elif user["password_hash"] is None:
            connection.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(password), user["id"]),
            )
        connection.commit()


def _apply_migrations(connection: sqlite3.Connection) -> None:
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version > SCHEMA_VERSION:
        raise RuntimeError(
            f"Database schema version {version} is newer than supported version {SCHEMA_VERSION}"
        )

    # Table rebuilds need foreign keys off; integrity is checked before each commit.
    connection.execute("PRAGMA foreign_keys = OFF")
    for migration in sorted(MIGRATIONS_DIRECTORY.glob("*.sql")):
        migration_version = int(migration.name.split("_", 1)[0])
        if migration_version <= version:
            continue
        if migration_version != version + 1:
            raise RuntimeError(f"Missing migration after schema version {version}")

        script = migration.read_text(encoding="utf-8")
        try:
            connection.executescript(
                f"BEGIN IMMEDIATE;\n{script}\nPRAGMA user_version = {migration_version};"
            )
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise RuntimeError(f"Migration {migration.name} broke foreign key integrity")
            connection.commit()
        except Exception:
            if connection.in_transaction:
                connection.rollback()
            raise
        version = migration_version
    connection.execute("PRAGMA foreign_keys = ON")

    if version != SCHEMA_VERSION:
        raise RuntimeError(f"No migration found for schema version {SCHEMA_VERSION}")


def create_user(database_path: Path, username: str, password: str) -> bool:
    """Create a user with one empty board. Returns False if the username is taken."""
    user_id = uuid4().hex
    with _connection(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (user_id, username, hash_password(password)),
            )
        except sqlite3.IntegrityError:
            connection.rollback()
            return False
        _create_board(connection, user_id, NEW_USER_BOARD_NAME, EMPTY_BOARD)
        connection.commit()
        return True


def verify_user(database_path: Path, username: str, password: str) -> bool:
    with _connection(database_path) as connection:
        user = connection.execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    return (
        user is not None
        and user["password_hash"] is not None
        and verify_password(password, user["password_hash"])
    )


def _create_board(
    connection: sqlite3.Connection, user_id: str, name: str, board_data: BoardData
) -> dict[str, str]:
    board_id = uuid4().hex
    connection.execute(
        "INSERT INTO boards (id, user_id, name) VALUES (?, ?, ?)",
        (board_id, user_id, name),
    )
    _insert_board(connection, board_id, board_data)
    return {"id": board_id, "name": name}


def _owns_board(connection: sqlite3.Connection, username: str, board_id: str) -> bool:
    board = connection.execute(
        """SELECT 1 FROM boards
           JOIN users ON users.id = boards.user_id
           WHERE users.username = ? AND boards.id = ?""",
        (username, board_id),
    ).fetchone()
    return board is not None


def list_boards(database_path: Path, username: str) -> list[dict[str, str]]:
    with _connection(database_path) as connection:
        rows = connection.execute(
            """SELECT boards.id, boards.name FROM boards
               JOIN users ON users.id = boards.user_id
               WHERE users.username = ?
               ORDER BY boards.rowid""",
            (username,),
        ).fetchall()
    return [{"id": row["id"], "name": row["name"]} for row in rows]


def create_board(database_path: Path, username: str, name: str) -> dict[str, str]:
    with _connection(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        board = _create_board(connection, user["id"], name, EMPTY_BOARD)
        connection.commit()
        return board


def rename_board(
    database_path: Path, username: str, board_id: str, name: str
) -> dict[str, str] | None:
    with _connection(database_path) as connection:
        if not _owns_board(connection, username, board_id):
            return None
        connection.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
        connection.commit()
        return {"id": board_id, "name": name}


def delete_board(database_path: Path, username: str, board_id: str) -> bool:
    with _connection(database_path) as connection:
        if not _owns_board(connection, username, board_id):
            return False
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))
        connection.commit()
        return True


def _read_board(connection: sqlite3.Connection, board_id: str) -> dict[str, object]:
    columns = connection.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    result_columns = [
        {"id": column["id"], "title": column["title"], "cardIds": []}
        for column in columns
    ]
    column_by_id = {column["id"]: column for column in result_columns}
    rows = connection.execute(
        """SELECT cards.id, cards.title, cards.details, cards.column_id
           FROM cards JOIN columns
             ON columns.board_id = cards.board_id AND columns.id = cards.column_id
           WHERE cards.board_id = ?
           ORDER BY columns.position, cards.position""",
        (board_id,),
    ).fetchall()
    cards: dict[str, dict[str, str]] = {}
    for row in rows:
        cards[row["id"]] = {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
        }
        column_by_id[row["column_id"]]["cardIds"].append(row["id"])
    return {"columns": result_columns, "cards": cards}


def _insert_board(
    connection: sqlite3.Connection, board_id: str, board_data: BoardData
) -> None:
    for column_position, column in enumerate(board_data.columns):
        connection.execute(
            "INSERT INTO columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            (board_id, column.id, column.title, column_position),
        )
        for card_position, card_id in enumerate(column.card_ids):
            card = board_data.cards[card_id]
            connection.execute(
                """INSERT INTO cards (board_id, id, column_id, title, details, position)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (board_id, card.id, column.id, card.title, card.details, card_position),
            )


def load_board(
    database_path: Path, username: str, board_id: str
) -> dict[str, object] | None:
    with _connection(database_path) as connection:
        if not _owns_board(connection, username, board_id):
            return None
        return _read_board(connection, board_id)


def replace_board(
    database_path: Path,
    username: str,
    board_id: str,
    board_data: BoardData,
    expected_board: dict[str, object] | None = None,
) -> bool:
    """Replace one of the user's boards. When expected_board is given, raise
    BoardChangedError instead of saving if the stored board no longer matches it."""
    with _connection(database_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        if not _owns_board(connection, username, board_id):
            connection.rollback()
            return False
        if expected_board is not None and _read_board(connection, board_id) != expected_board:
            connection.rollback()
            raise BoardChangedError("The board changed while the update was prepared")

        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
        _insert_board(connection, board_id, board_data)
        connection.commit()
        return True
