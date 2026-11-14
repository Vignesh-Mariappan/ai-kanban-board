import json

import pytest
from pydantic import ValidationError

from app.database import DEFAULT_SEED_PATH
from app.schemas import BoardData


def test_board_data_rejects_duplicate_card_membership() -> None:
    seed = json.loads(DEFAULT_SEED_PATH.read_text(encoding="utf-8"))["users"][0]["board"]
    payload = {"columns": seed["columns"], "cards": seed["cards"]}
    payload["columns"][0]["cardIds"].append("card-3")

    with pytest.raises(ValidationError, match="only one column"):
        BoardData.model_validate(payload)