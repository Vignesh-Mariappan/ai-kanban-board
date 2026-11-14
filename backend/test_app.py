import json
import os
from pathlib import Path

from app.chat import ChatOutput
from app.main import create_app
from app.openrouter import OpenRouterError


class PlaywrightChatProvider:
    def complete(self, prompt: str, *, json_mode: bool = False) -> str:
        context = json.loads(prompt)
        question = context["question"].lower()
        board = context["board"]
        if "provider error" in question:
            raise OpenRouterError("simulated provider failure")
        if "create e2e card" in question:
            card = {
                "id": "card-ai-created",
                "title": "AI-created card",
                "details": "Created by the test assistant.",
            }
            board["cards"][card["id"]] = card
            board["columns"][0]["cardIds"].append(card["id"])
            response = "I created the card."
        elif "edit e2e card" in question:
            board["cards"]["card-ai-created"]["title"] = "AI-edited card"
            response = "I updated the card."
        elif "move e2e card" in question:
            board["columns"][0]["cardIds"].remove("card-ai-created")
            board["columns"][2]["cardIds"].append("card-ai-created")
            response = "I moved the card."
        else:
            board = None
            response = "Your board looks good."
        return ChatOutput(
            response=response,
            board_update=board,
        ).model_dump_json(by_alias=True)


database_path = Path(os.environ["DATABASE_PATH"])
database_path.parent.mkdir(parents=True, exist_ok=True)
database_path.unlink(missing_ok=True)
app = create_app(
    database_path=database_path,
    chat_provider=PlaywrightChatProvider(),
)
