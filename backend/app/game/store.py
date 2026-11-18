"""Persist the single active game as JSON in SQLite."""

import time

from sqlalchemy import Engine
from sqlmodel import Session

from app.game.engine import Game
from app.game.state import GameState
from app.models import ActiveGame


def save_game(db: Engine, game: Game) -> None:
    with Session(db) as session:
        row = session.get(ActiveGame, 1)
        if row is None:
            row = ActiveGame(id=1, quiz_id=game.quiz.id, state_json="", updated_at=0.0)
        row.quiz_id = game.quiz.id
        row.state_json = game.state.model_dump_json()
        row.updated_at = time.time()
        session.add(row)
        session.commit()


def load_game(db: Engine) -> tuple[int, GameState] | None:
    with Session(db) as session:
        row = session.get(ActiveGame, 1)
        if row is None:
            return None
        return row.quiz_id, GameState.model_validate_json(row.state_json)


def clear_game(db: Engine) -> None:
    with Session(db) as session:
        row = session.get(ActiveGame, 1)
        if row is not None:
            session.delete(row)
            session.commit()
