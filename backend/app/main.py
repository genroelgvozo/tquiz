from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import auth
from app.api import media, quizzes
from app.config import Settings
from app.db import init_db, make_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    db = make_engine(settings.data_dir)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(db)
        yield

    app = FastAPI(title="TQuiz", lifespan=lifespan)
    app.state.settings = settings
    app.state.db = db
    app.state.locked_quiz_id = lambda: None

    app.include_router(auth.router)
    app.include_router(quizzes.router)
    app.include_router(media.router)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    return app
