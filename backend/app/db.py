from collections.abc import Iterator
from pathlib import Path

from fastapi import Request
from sqlalchemy import Engine, text
from sqlmodel import Session, SQLModel, create_engine


def make_engine(data_dir: Path) -> Engine:
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "media").mkdir(exist_ok=True)
    return create_engine(
        f"sqlite:///{data_dir / 'tquiz.db'}",
        connect_args={"check_same_thread": False},
    )


def init_db(engine: Engine) -> None:
    from app import models  # noqa: F401  (registers tables)

    SQLModel.metadata.create_all(engine)
    _add_missing_columns(engine)


def _add_missing_columns(engine: Engine) -> None:
    """Tiny migration: add columns introduced after the first release to existing tables."""
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(round)"))}
        if "cell_values" not in cols:
            conn.execute(
                text("ALTER TABLE round ADD COLUMN cell_values JSON NOT NULL DEFAULT '[100, 200, 300, 400, 500]'")
            )


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.db) as session:
        yield session
