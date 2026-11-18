"""«Свободный ввод» round logic (filled in Task 6)."""

from typing import TYPE_CHECKING

from app.game.state import FreeState, Timer

if TYPE_CHECKING:
    from app.game.engine import Game

HANDLERS: dict = {}
TEAM_HANDLERS: dict = {}


def start(game: "Game") -> None:
    rnd = game.current_round()
    game.state.free = FreeState(
        timer=Timer(total_seconds=rnd.discuss_seconds + rnd.input_seconds, input_seconds=rnd.input_seconds)
    )


def tick(game: "Game") -> bool:
    return False
