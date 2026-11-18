"""SQLModel tables."""

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Quiz(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    logo_filename: str | None = None


class Round(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    quiz_id: int = Field(index=True, foreign_key="quiz.id")
    position: int = 0
    title: str = ""
    kind: str  # "jeopardy" | "free"
    # jeopardy settings
    minus_on_wrong: bool = False
    buzzer_mode: str = "bar"  # "instant" | "bar"
    bar_seconds: int = 5
    # free-input settings
    discuss_seconds: int = 60
    input_seconds: int = 15
    stakes: bool = False


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    round_id: int = Field(index=True, foreign_key="round.id")
    position: int = 0
    name: str = ""


class Question(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    round_id: int = Field(index=True, foreign_key="round.id")
    category_id: int | None = Field(default=None, index=True, foreign_key="category.id")
    position: int = 0
    text: str = ""
    answer: str = ""
    media_filename: str | None = None
    media_kind: str | None = None  # "image" | "audio"
    # jeopardy
    value: int = 0
    is_secret: bool = False
    # free input
    nominal: int = 1
    options: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    correct_option: int | None = None
    discuss_seconds: int | None = None
    input_seconds: int | None = None


class ActiveGame(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    quiz_id: int
    state_json: str
    updated_at: float
