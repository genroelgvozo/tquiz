from collections.abc import Iterator
from pathlib import Path

from fastapi import Request
from sqlalchemy import Engine
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


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.db) as session:
        yield session
