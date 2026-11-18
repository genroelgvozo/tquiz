"""Per-role snapshots of the game. This is the ONLY place that decides what each role may see:
screen and team views are built field by field, never by dumping internal models."""

from typing import Literal

from pydantic import BaseModel

from app.game import freeinput, jeopardy
from app.game.engine import Game
from app.game.jeopardy import BuzzerStatus
from app.game.state import (
    Answer,
    AudioCmd,
    Buttons,
    FreeState,
    JeopardyPhase,
    JeopardyState,
    Stage,
    Timer,
)
from app.quizdata import MediaRef, QuestionData, QuizData, RoundData


class TeamPublic(BaseModel):
    id: str
    name: str
    score: int


class RejoinPublic(BaseModel):
    id: str
    team_id: str
    team_name: str


class RoundPublic(BaseModel):
    index: int
    title: str
    kind: Literal["jeopardy", "free"]
    total: int


class ScreenQuestion(BaseModel):
    title: str
    text: str | None
    media: MediaRef | None
    options: list[str]
    answer: str | None


class BoardCell(BaseModel):
    question_id: int
    value: int
    played: bool


class BoardCategory(BaseModel):
    name: str
    cells: list[BoardCell]


class ScreenJeopardy(BaseModel):
    phase: JeopardyPhase
    board: list[BoardCategory]
    chooser_team_id: str | None
    answering_team_id: str | None
    buttons: Buttons
    bar_ends_at: float | None
    bar_seconds: int
    question: ScreenQuestion | None


class ScreenFree(BaseModel):
    phase: Literal["question", "review"]
    number: int
    total: int
    timer: Timer
    question: ScreenQuestion


class ScreenView(BaseModel):
    kind: Literal["screen"] = "screen"
    now: float
    quiz_title: str
    logo_url: str | None
    stage: Stage
    join_url: str
    qr_visible: bool
    teams: list[TeamPublic]
    round: RoundPublic | None
    overlay: Literal["leaderboard"] | None
    audio: AudioCmd
    preload: list[str]
    jeopardy: ScreenJeopardy | None
    free: ScreenFree | None


class TeamJeopardy(BaseModel):
    label: str | None
    buzzer: BuzzerStatus
    bar_ends_at: float | None
    locked_until: float | None


class TeamFree(BaseModel):
    phase: Literal["question", "review"]
    number: int
    total: int
    options: list[str]
    stakes: bool
    input_open: bool
    answer: Answer
    timer: Timer


class TeamView(BaseModel):
    kind: Literal["team"] = "team"
    now: float
    team: TeamPublic
    stage: Stage
    round: RoundPublic | None
    jeopardy: TeamJeopardy | None
    free: TeamFree | None


class AdminState(BaseModel):
    quiz_id: int
    stage: Stage
    qr_visible: bool
    teams: list[TeamPublic]
    rejoin_requests: list[RejoinPublic]
    round_index: int
    jeopardy: JeopardyState | None
    free: FreeState | None
    overlay: Literal["leaderboard"] | None
    audio: AudioCmd


class AdminView(BaseModel):
    kind: Literal["admin"] = "admin"
    now: float
    join_url: str
    quiz: QuizData
    state: AdminState
    online_team_ids: list[str]
    undo_available: bool


# ---------- helpers ----------

_IN_ROUND: set[str] = {"intro", "jeopardy", "free"}


def _teams(game: Game) -> list[TeamPublic]:
    return [TeamPublic(id=t.id, name=t.name, score=t.score) for t in game.state.teams]


def _round(game: Game) -> RoundData | None:
    if game.state.stage not in _IN_ROUND:
        return None
    return game.current_round()


def _round_public(game: Game) -> RoundPublic | None:
    rnd = _round(game)
    if rnd is None:
        return None
    return RoundPublic(index=game.state.round_index, title=rnd.title, kind=rnd.kind, total=len(game.quiz.rounds))


def _jeopardy_label(rnd: RoundData, question: QuestionData) -> str:
    cat = rnd.category_of(question.id)
    return f"{cat.name if cat else ''} · {question.value}"


def _preload(rnd: RoundData | None) -> list[str]:
    if rnd is None:
        return []
    urls: list[str] = []
    for question in rnd.all_questions():
        if question.media and question.media.url not in urls:
            urls.append(question.media.url)
    return urls


def _screen_jeopardy(game: Game, rnd: RoundData) -> ScreenJeopardy:
    j = game.state.jeopardy
    board = [
        BoardCategory(
            name=c.name,
            cells=[BoardCell(question_id=q.id, value=q.value, played=q.id in j.played) for q in c.questions],
        )
        for c in rnd.categories
    ]
    question = None
    current = jeopardy.current_question(game)
    if current is not None and j.phase != "board":
        question = ScreenQuestion(
            title=_jeopardy_label(rnd, current),
            text=None if j.phase == "secret" else current.text,
            media=None if j.phase == "secret" else current.media,
            options=[],
            answer=current.answer if j.phase == "answer" else None,
        )
    return ScreenJeopardy(
        phase=j.phase,
        board=board,
        chooser_team_id=j.chooser_team_id,
        answering_team_id=j.answering_team_id,
        buttons=j.buttons,
        bar_ends_at=j.bar_ends_at,
        bar_seconds=rnd.bar_seconds,
        question=question,
    )


def _screen_free(game: Game, rnd: RoundData) -> ScreenFree:
    free = game.state.free
    total = len(rnd.questions)
    reviewing = free.phase == "review"
    index = free.review_index if reviewing else free.index
    current = rnd.questions[index]
    return ScreenFree(
        phase=free.phase,
        number=index + 1,
        total=total,
        timer=free.timer,
        question=ScreenQuestion(
            title=f"Вопрос {index + 1} из {total}",
            text=current.text,
            media=current.media,
            options=list(current.options),
            answer=current.answer if reviewing else None,
        ),
    )


# ---------- public builders ----------


def screen_view(game: Game, join_url: str) -> ScreenView:
    st = game.state
    rnd = _round(game)
    return ScreenView(
        now=game.now(),
        quiz_title=game.quiz.title,
        logo_url=game.quiz.logo.url if game.quiz.logo else None,
        stage=st.stage,
        join_url=join_url,
        qr_visible=st.qr_visible,
        teams=_teams(game),
        round=_round_public(game),
        overlay=st.overlay,
        audio=st.audio,
        preload=_preload(rnd),
        jeopardy=_screen_jeopardy(game, rnd) if st.stage == "jeopardy" and st.jeopardy else None,
        free=_screen_free(game, rnd) if st.stage == "free" and st.free else None,
    )


def team_view(game: Game, team_id: str) -> TeamView:
    st = game.state
    team = game.team(team_id)
    rnd = _round(game)
    jv = fv = None
    if st.stage == "jeopardy" and st.jeopardy:
        j = st.jeopardy
        current = jeopardy.current_question(game)
        lock = j.lockouts.get(team_id)
        jv = TeamJeopardy(
            label=_jeopardy_label(rnd, current) if current is not None and j.phase != "board" else None,
            buzzer=jeopardy.buzzer_status(game, team_id),
            bar_ends_at=j.bar_ends_at,
            locked_until=lock if lock is not None and lock > game.now() else None,
        )
    if st.stage == "free" and st.free:
        free = st.free
        reviewing = free.phase == "review"
        index = free.review_index if reviewing else free.index
        current = rnd.questions[index]
        own = free.answers.get(str(current.id), {}).get(team_id)
        fv = TeamFree(
            phase=free.phase,
            number=index + 1,
            total=len(rnd.questions),
            options=list(current.options),
            stakes=rnd.stakes,
            input_open=freeinput.input_open(game),
            answer=own.model_copy() if own else Answer(),
            timer=free.timer,
        )
    return TeamView(
        now=game.now(),
        team=TeamPublic(id=team.id, name=team.name, score=team.score),
        stage=st.stage,
        round=_round_public(game),
        jeopardy=jv,
        free=fv,
    )


def admin_view(game: Game, join_url: str, online: set[str]) -> AdminView:
    st = game.state
    names = {t.id: t.name for t in st.teams}
    state = AdminState(
        quiz_id=st.quiz_id,
        stage=st.stage,
        qr_visible=st.qr_visible,
        teams=_teams(game),
        rejoin_requests=[
            RejoinPublic(id=r.id, team_id=r.team_id, team_name=names.get(r.team_id, "")) for r in st.rejoin_requests
        ],
        round_index=st.round_index,
        jeopardy=st.jeopardy,
        free=st.free,
        overlay=st.overlay,
        audio=st.audio,
    )
    return AdminView(
        now=game.now(),
        join_url=join_url,
        quiz=game.quiz,
        state=state,
        online_team_ids=[t.id for t in st.teams if t.id in online],
        undo_available=bool(st.undo_stack),
    )
