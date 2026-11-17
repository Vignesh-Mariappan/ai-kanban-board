from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from app.chat import (
    ChatProvider,
    ChatRequest,
    ChatResult,
    InvalidChatOutput,
    build_chat_prompt,
    parse_chat_output,
)
from app.database import (
    DEFAULT_DATABASE_PATH,
    DEFAULT_SEED_PATH,
    BoardChangedError,
    create_board,
    create_user,
    delete_board,
    initialize_database,
    list_boards,
    load_board,
    rename_board,
    replace_board,
    verify_user,
)
from app.openrouter import OpenRouterClient, OpenRouterConfigurationError, OpenRouterError
from app.schemas import BoardData, BoardName, BoardSummary, UserCreate

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
security = HTTPBasic()


def board_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Board not found")


def create_app(
    database_path: Path | None = None,
    seed_path: Path | None = None,
    frontend_static_dir: Path | None = None,
    chat_provider: ChatProvider | None = None,
) -> FastAPI:
    db_path = database_path or Path(os.environ.get("DATABASE_PATH", DEFAULT_DATABASE_PATH))
    board_seed_path = seed_path or Path(os.environ.get("KANBAN_SEED_PATH", DEFAULT_SEED_PATH))
    static_dir = frontend_static_dir or Path(
        os.environ.get("FRONTEND_STATIC_DIR", PROJECT_ROOT / "frontend" / "out")
    )
    provider = chat_provider if chat_provider is not None else OpenRouterClient()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        initialize_database(db_path, board_seed_path, DEMO_USERNAME, DEMO_PASSWORD)
        yield

    application = FastAPI(title="Kanban MVP", lifespan=lifespan)

    def authenticated_username(
        credentials: Annotated[HTTPBasicCredentials, Depends(security)],
    ) -> str:
        if not verify_user(db_path, credentials.username, credentials.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )
        return credentials.username

    Username = Annotated[str, Depends(authenticated_username)]

    def owned_board(username: str, board_id: str) -> dict[str, object]:
        board = load_board(db_path, username, board_id)
        if board is None:
            raise board_not_found()
        return board

    @application.post("/api/users", status_code=201)
    def register_user(user: UserCreate) -> dict[str, str]:
        if not create_user(db_path, user.username, user.password):
            raise HTTPException(status_code=409, detail="That username is already taken")
        return {"username": user.username}

    @application.get("/api/boards", response_model=list[BoardSummary])
    def read_boards(username: Username) -> list[dict[str, str]]:
        return list_boards(db_path, username)

    @application.post("/api/boards", response_model=BoardSummary, status_code=201)
    def add_board(board_name: BoardName, username: Username) -> dict[str, str]:
        return create_board(db_path, username, board_name.name)

    @application.patch("/api/boards/{board_id}", response_model=BoardSummary)
    def update_board_name(
        board_id: str, board_name: BoardName, username: Username
    ) -> dict[str, str]:
        board = rename_board(db_path, username, board_id, board_name.name)
        if board is None:
            raise board_not_found()
        return board

    @application.delete("/api/boards/{board_id}", status_code=204)
    def remove_board(board_id: str, username: Username) -> Response:
        if not delete_board(db_path, username, board_id):
            raise board_not_found()
        return Response(status_code=204)

    @application.get("/api/boards/{board_id}", response_model=BoardData)
    def read_board(board_id: str, username: Username) -> dict[str, object]:
        return owned_board(username, board_id)

    @application.put("/api/boards/{board_id}", response_model=BoardData)
    def update_board(
        board_id: str, board_data: BoardData, username: Username
    ) -> dict[str, object]:
        if not replace_board(db_path, username, board_id, board_data):
            raise board_not_found()
        return owned_board(username, board_id)

    @application.post("/api/boards/{board_id}/chat", response_model=ChatResult)
    def chat(board_id: str, request: ChatRequest, username: Username) -> ChatResult:
        board = owned_board(username, board_id)

        try:
            content = provider.complete(build_chat_prompt(board, request), json_mode=True)
            result = parse_chat_output(content)
        except OpenRouterConfigurationError:
            raise HTTPException(status_code=503, detail="AI service is not configured") from None
        except OpenRouterError as error:
            raise HTTPException(status_code=502, detail=error.public_message) from None
        except InvalidChatOutput:
            raise HTTPException(status_code=502, detail="AI response was invalid") from None

        board_updated = result.board_update is not None
        if board_updated:
            try:
                saved = replace_board(
                    db_path, username, board_id, result.board_update, expected_board=board
                )
            except BoardChangedError:
                raise HTTPException(
                    status_code=409,
                    detail="The board changed while the assistant was responding. Please try again.",
                ) from None
            if not saved:
                raise board_not_found()
        return ChatResult(response=result.response, board_updated=board_updated)

    @application.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/api/hello")
    def hello() -> dict[str, str]:
        return {"message": "Hello, world!"}

    if static_dir.is_dir():
        application.mount(
            "/",
            StaticFiles(directory=static_dir, html=True),
            name="frontend",
        )
    return application


app = create_app()