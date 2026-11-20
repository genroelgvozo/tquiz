"""Per-role snapshots of the game. This is the ONLY place that decides what each role may see:
screen and team views are built field by field, never by dumping internal models."""

from typing import Literal

from pydantic import BaseModel

from app.game import freeinput, jeopardy, scoring
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


class StandingsColumn(BaseModel):
    index: int
    title: str
    closed: bool


class StandingsRow(BaseModel):
    team_id: str
    name: str
    rounds: list[int | None]
    total: int


class Standings(BaseModel):
    columns: list[StandingsColumn]
    rows: list[StandingsRow]


class TeamScore(BaseModel):
    kind: Literal["round", "total"]
    value: int


class AdminTeam(BaseModel):
    id: str
    name: str
    round_score: int | None
    total: int


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
    # option index to highlight after the answer is shown (named so that `correct_option` never appears)
    highlight_option: int | None = None


class BoardCell(BaseModel):
    question_id: int
    value: int
    played: bool


class BoardCategory(BaseModel):
    name: str
    cells: list[BoardCell]


class TypingView(BaseModel):
    """Letter-by-letter printing: printed = base + (now - since) * speed while since is set, frozen at base otherwise."""

    base: float
    since: float | None
    speed: int


class ScreenJeopardy(BaseModel):
    phase: JeopardyPhase
    board: list[BoardCategory]
    chooser_team_id: str | None
    answering_team_id: str | None
    buttons: Buttons
    bar_ends_at: float | None
    bar_seconds: int
    question_id: int | None
    question: ScreenQuestion | None
    typing: TypingView | None
    scores: dict[str, int]


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
    standings: Standings
    jeopardy: ScreenJeopardy | None
    free: ScreenFree | None


class TeamJeopardy(BaseModel):
    label: str | None
    buzzer: BuzzerStatus
    bar_ends_at: float | None
    bar_seconds: int
    locked_until: float | None


class TeamFree(BaseModel):
    phase: Literal["question", "review"]
    question_id: int
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
    score: TeamScore | None
    stage: Stage
    round: RoundPublic | None
    jeopardy: TeamJeopardy | None
    free: TeamFree | None


class AdminState(BaseModel):
    quiz_id: int
    stage: Stage
    qr_visible: bool
    teams: list[AdminTeam]
    standings: Standings
    score_adjust_round: int | None
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
    return [TeamPublic(id=t.id, name=t.name) for t in game.state.teams]


def _standings(game: Game) -> Standings:
    closed = set(game.state.closed_rounds)
    columns = [
        StandingsColumn(index=i, title=r.title, closed=i in closed) for i, r in enumerate(game.quiz.rounds)
    ]
    rows = sorted(
        (
            (
                scoring.total(game, t),
                t.joined_at,
                StandingsRow(
                    team_id=t.id,
                    name=t.name,
                    rounds=[scoring.stored_round_score(t, c.index) if c.closed else None for c in columns],
                    total=scoring.total(game, t),
                ),
            )
            for t in game.state.teams
        ),
        key=lambda x: (-x[0], x[1]),
    )
    return Standings(columns=columns, rows=[row for _, _, row in rows])


def _admin_teams(game: Game) -> list[AdminTeam]:
    return [
        AdminTeam(
            id=t.id,
            name=t.name,
            round_score=scoring.current_round_score(game, t),
            total=scoring.total(game, t),
        )
        for t in game.state.teams
    ]


def _team_score(game: Game, team) -> TeamScore | None:
    stage = game.state.stage
    if stage in ("intro", "finished"):
        return TeamScore(kind="total", value=scoring.total(game, team))
    if stage == "jeopardy":
        return TeamScore(kind="round", value=scoring.current_round_score(game, team) or 0)
    return None


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
    question_id = question = typing = None
    current = jeopardy.current_question(game)
    if current is not None and j.phase != "board":
        question_id = current.id
        question = ScreenQuestion(
            title=_jeopardy_label(rnd, current),
            text=None if j.phase == "secret" else current.text,
            media=None if j.phase == "secret" else current.media,
            options=[],
            answer=current.answer if j.phase == "answer" else None,
            highlight_option=None,
        )
        # printing only while a plain question is live; in the answer the whole text is shown
        if rnd.typewriter and j.phase == "question" and not current.is_secret:
            typing = TypingView(base=j.typed_base, since=j.typing_since, speed=rnd.type_speed)
    return ScreenJeopardy(
        phase=j.phase,
        board=board,
        chooser_team_id=j.chooser_team_id,
        answering_team_id=j.answering_team_id,
        buttons=j.buttons,
        bar_ends_at=j.bar_ends_at,
        bar_seconds=rnd.bar_seconds,
        question_id=question_id,
        question=question,
        typing=typing,
        scores={t.id: scoring.current_round_score(game, t) or 0 for t in game.state.teams},
    )


def _screen_free(game: Game, rnd: RoundData) -> ScreenFree:
    free = game.state.free
    total = len(rnd.questions)
    reviewing = free.phase == "review"
    show_answer = reviewing and free.answer_shown
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
            answer=_revealed_answer(current) if show_answer else None,
            highlight_option=current.correct_option if show_answer else None,
        ),
    )


def _revealed_answer(question: QuestionData) -> str:
    if question.answer.strip():
        return question.answer
    if question.options and question.correct_option is not None:
        return f"{chr(65 + question.correct_option)}. {question.options[question.correct_option]}"
    return question.answer


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
        standings=_standings(game),
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
            bar_seconds=rnd.bar_seconds,
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
            question_id=current.id,
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
        team=TeamPublic(id=team.id, name=team.name),
        score=_team_score(game, team),
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
        teams=_admin_teams(game),
        standings=_standings(game),
        score_adjust_round=scoring.adjust_round(game),
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
