import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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

    if settings.static_dir is not None:
        _mount_spa(app, settings)

    return app


def _mount_spa(app: FastAPI, settings: Settings) -> None:
    static = settings.static_dir
    index = static / "index.html"
    if (static / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    def spa() -> FileResponse:
        return FileResponse(index)

    for path in ("/", "/play", "/screen", "/admin", "/admin/{rest:path}"):
        app.add_api_route(path, spa, methods=["GET"], include_in_schema=False)
