import json
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
    from app.models import DEFAULT_CELL_VALUES, DEFAULT_THEME

    wanted = {
        "quiz": [
            ("theme", f"JSON NOT NULL DEFAULT '{json.dumps(DEFAULT_THEME)}'"),
            ("background_filename", "VARCHAR"),
            ("lobby_music_filename", "VARCHAR"),
        ],
        "round": [
            ("cell_values", f"JSON NOT NULL DEFAULT '{json.dumps(DEFAULT_CELL_VALUES)}'"),
            ("background_filename", "VARCHAR"),
            ("intro_music_filename", "VARCHAR"),
            ("think_music_filename", "VARCHAR"),
            ("typewriter", "BOOLEAN NOT NULL DEFAULT 0"),
            ("type_speed", "INTEGER NOT NULL DEFAULT 15"),
        ],
    }
    with engine.begin() as conn:
        for table, columns in wanted.items():
            existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            for column, ddl in columns:
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.db) as session:
        yield session
