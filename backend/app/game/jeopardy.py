"""«Своя игра» round logic (filled in Task 7)."""

from typing import TYPE_CHECKING

from app.game.state import JeopardyState

if TYPE_CHECKING:
    from app.game.engine import Game

HANDLERS: dict = {}
TEAM_HANDLERS: dict = {}


def start(game: "Game") -> None:
    game.state.jeopardy = JeopardyState()


def tick(game: "Game") -> bool:
    return False


def on_team_deleted(game: "Game", team_id: str) -> None:
    pass
