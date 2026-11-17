from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

FIXED_COLUMN_IDS = {
    "col-backlog",
    "col-discovery",
    "col-progress",
    "col-review",
    "col-done",
}
ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]*$"


def _not_blank(value: str, info: ValidationInfo) -> str:
    if not value.strip():
        raise ValueError(f"{info.field_name} must not be blank")
    return value


NonBlankStr = Annotated[str, AfterValidator(_not_blank)]


class CardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=ID_PATTERN)
    title: NonBlankStr = Field(min_length=1)
    details: str = ""


class ColumnData(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=ID_PATTERN)
    title: NonBlankStr = Field(min_length=1)
    card_ids: list[str] = Field(alias="cardIds")


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[ColumnData] = Field(min_length=5, max_length=5)
    cards: dict[str, CardData]

    @model_validator(mode="after")
    def validate_board_relationships(self) -> "BoardData":
        if {column.id for column in self.columns} != FIXED_COLUMN_IDS:
            raise ValueError("board must contain each of the five fixed column IDs exactly once")

        card_ids = [card_id for column in self.columns for card_id in column.card_ids]
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("a card may appear in only one column")
        if set(card_ids) != set(self.cards):
            raise ValueError("column cardIds must reference every board card exactly once")
        if any(card_id != card.id for card_id, card in self.cards.items()):
            raise ValueError("each card map key must match its card ID")
        return self


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,32}$")
    password: str = Field(min_length=8, max_length=128)


class BoardName(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()


class BoardSummary(BaseModel):
    id: str
    name: str
