from contextlib import asynccontextmanager
import hmac
import os
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
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
    initialize_database,
    load_board,
    replace_board,
)
from app.openrouter import OpenRouterClient, OpenRouterConfigurationError, OpenRouterError
from app.schemas import BoardData

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
security = HTTPBasic()


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
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        initialize_database(db_path, board_seed_path, DEMO_USERNAME)
        yield

    application = FastAPI(title="Kanban MVP", lifespan=lifespan)
    application.state.chat_provider = (
        chat_provider if chat_provider is not None else OpenRouterClient()
    )

    def authenticated_username(
        credentials: Annotated[HTTPBasicCredentials, Depends(security)],
    ) -> str:
        username_matches = hmac.compare_digest(credentials.username, DEMO_USERNAME)
        password_matches = hmac.compare_digest(credentials.password, DEMO_PASSWORD)
        if not (username_matches and password_matches):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )
        return credentials.username

    @application.get("/api/board", response_model=BoardData)
    def read_board(username: Annotated[str, Depends(authenticated_username)]) -> dict[str, object]:
        board = load_board(db_path, username)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return board

    @application.put("/api/board", response_model=BoardData)
    def update_board(
        board_data: BoardData,
        username: Annotated[str, Depends(authenticated_username)],
    ) -> dict[str, object]:
        if not replace_board(db_path, username, board_data):
            raise HTTPException(status_code=404, detail="Board not found")
        board = load_board(db_path, username)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        return board

    @application.post("/api/chat", response_model=ChatResult)
    def chat(
        request: ChatRequest,
        username: Annotated[str, Depends(authenticated_username)],
    ) -> ChatResult:
        board = load_board(db_path, username)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")

        try:
            content = application.state.chat_provider.complete(
                build_chat_prompt(board, request),
                json_mode=True,
            )
            result = parse_chat_output(content)
        except OpenRouterConfigurationError:
            raise HTTPException(status_code=503, detail="AI service is not configured") from None
        except OpenRouterError as error:
            raise HTTPException(
                status_code=502,
                detail=error.public_message,
            ) from None
        except InvalidChatOutput:
            raise HTTPException(status_code=502, detail="AI response was invalid") from None

        board_updated = result.board_update is not None
        try:
            if board_updated and not replace_board(
                db_path, username, result.board_update, expected_board=board
            ):
                raise HTTPException(status_code=404, detail="Board not found")
        except BoardChangedError:
            raise HTTPException(
                status_code=409,
                detail="The board changed while the assistant was responding. Please try again.",
            ) from None
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