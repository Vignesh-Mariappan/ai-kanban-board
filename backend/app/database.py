from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from typing import Iterator

from app.schemas import BoardData

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "kanban.sqlite3"
DEFAULT_SEED_PATH = PROJECT_ROOT / "docs" / "kanban-board.example.json"
MIGRATIONS_DIRECTORY = Path(__file__).resolve().parents[1] / "migrations"
SCHEMA_VERSION = 1


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
) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    seed_document = json.loads(seed_path.read_text(encoding="utf-8"))
    seed_user = seed_document["users"][0]
    seed_board = BoardData.model_validate(
        {
            "columns": seed_user["board"]["columns"],
            "cards": seed_user["board"]["cards"],
        }
    )

    with _connection(database_path) as connection:
        _apply_migrations(connection)
        connection.execute("BEGIN")

        connection.execute(
            "INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)",
            (seed_user["id"], username),
        )
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?", (user["id"],)
        ).fetchone()

        if board is None:
            board_id = seed_user["board"]["id"]
            connection.execute(
                "INSERT INTO boards (id, user_id) VALUES (?, ?)",
                (board_id, user["id"]),
            )
            for column_position, column in enumerate(seed_board.columns):
                connection.execute(
                    "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                    (column.id, board_id, column.title, column_position),
                )
                for card_position, card_id in enumerate(column.card_ids):
                    card = seed_board.cards[card_id]
                    connection.execute(
                        """INSERT INTO cards (id, column_id, title, details, position)
                           VALUES (?, ?, ?, ?, ?)""",
                        (card.id, column.id, card.title, card.details, card_position),
                    )
        connection.commit()


def _apply_migrations(connection: sqlite3.Connection) -> None:
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version > SCHEMA_VERSION:
        raise RuntimeError(
            f"Database schema version {version} is newer than supported version {SCHEMA_VERSION}"
        )

    migrations = sorted(MIGRATIONS_DIRECTORY.glob("*.sql"))
    for migration in migrations:
        migration_version = int(migration.name.split("_", 1)[0])
        if migration_version <= version:
            continue
        if migration_version != version + 1:
            raise RuntimeError(f"Missing migration after schema version {version}")

        script = migration.read_text(encoding="utf-8")
        try:
            connection.executescript(
                f"BEGIN IMMEDIATE;\n{script}\n"
                f"PRAGMA user_version = {migration_version};\nCOMMIT;"
            )
        except Exception:
            if connection.in_transaction:
                connection.rollback()
            raise
        version = migration_version

    if version != SCHEMA_VERSION:
        raise RuntimeError(f"No migration found for schema version {SCHEMA_VERSION}")


def load_board(database_path: Path, username: str) -> dict[str, object] | None:
    with _connection(database_path) as connection:
        board = connection.execute(
            """SELECT boards.id FROM boards
               JOIN users ON users.id = boards.user_id
               WHERE users.username = ?""",
            (username,),
        ).fetchone()
        if board is None:
            return None

        columns = connection.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()
        result_columns = [
            {"id": column["id"], "title": column["title"], "cardIds": []}
            for column in columns
        ]
        column_by_id = {column["id"]: column for column in result_columns}
        cards: dict[str, dict[str, str]] = {}
        rows = connection.execute(
            """SELECT cards.id, cards.title, cards.details, cards.column_id
               FROM cards JOIN columns ON columns.id = cards.column_id
               WHERE columns.board_id = ?
               ORDER BY columns.position, cards.position""",
            (board["id"],),
        ).fetchall()
        for row in rows:
            cards[row["id"]] = {
                "id": row["id"],
                "title": row["title"],
                "details": row["details"],
            }
            column_by_id[row["column_id"]]["cardIds"].append(row["id"])
        return {"columns": result_columns, "cards": cards}


def replace_board(database_path: Path, username: str, board_data: BoardData) -> bool:
    with _connection(database_path) as connection:
        connection.execute("BEGIN")
        board = connection.execute(
            """SELECT boards.id FROM boards
               JOIN users ON users.id = boards.user_id
               WHERE users.username = ?""",
            (username,),
        ).fetchone()
        if board is None:
            connection.rollback()
            return False

        board_id = board["id"]
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
        for column_position, column in enumerate(board_data.columns):
            connection.execute(
                "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                (column.id, board_id, column.title, column_position),
            )
            for card_position, card_id in enumerate(column.card_ids):
                card = board_data.cards[card_id]
                connection.execute(
                    """INSERT INTO cards (id, column_id, title, details, position)
                       VALUES (?, ?, ?, ?, ?)""",
                    (card.id, column.id, card.title, card.details, card_position),
                )
        connection.commit()
        return True