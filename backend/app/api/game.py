"""Start/stop the single active game and hand out the big-screen link."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import require_admin, screen_key
from app.db import get_session
from app.quizdata import load_quiz_data

router = APIRouter(dependencies=[Depends(require_admin)])


class StartBody(BaseModel):
    quiz_id: int
    force: bool = False


@router.post("/api/game/start", status_code=204)
async def start_game(body: StartBody, request: Request, session: Session = Depends(get_session)) -> Response:
    hub = request.app.state.hub
    if hub.game is not None and not body.force:
        raise HTTPException(409, "Уже идёт игра")
    try:
        quiz = load_quiz_data(session, body.quiz_id)
    except LookupError:
        raise HTTPException(404, "Квиз не найден")
    if not quiz.rounds:
        raise HTTPException(400, "В квизе нет туров")
    await hub.start_game(body.quiz_id)
    return Response(status_code=204)


@router.post("/api/game/stop", status_code=204)
async def stop_game(request: Request) -> Response:
    await request.app.state.hub.stop_game()
    return Response(status_code=204)


@router.get("/api/game/screen-link")
def screen_link(request: Request) -> dict:
    settings = request.app.state.settings
    return {"url": f"{settings.public_url.rstrip('/')}/screen?key={screen_key(settings)}"}
