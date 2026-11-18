import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import auth
from app.api import game, media, quizzes
from app.config import Settings
from app.db import init_db, make_engine
from app.ws import routes as ws_routes
from app.ws.hub import Hub


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    db = make_engine(settings.data_dir)
    hub = Hub(settings, db)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(db)
        hub.restore()
        ticker = asyncio.create_task(hub.run_ticks())
        try:
            yield
        finally:
            ticker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await ticker

    app = FastAPI(title="TQuiz", lifespan=lifespan)
    app.state.settings = settings
    app.state.db = db
    app.state.hub = hub
    app.state.locked_quiz_id = lambda: hub.locked_quiz_id

    app.include_router(auth.router)
    app.include_router(quizzes.router)
    app.include_router(media.router)
    app.include_router(game.router)
    app.include_router(ws_routes.router)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    return app
