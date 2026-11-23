"""Game engine: pure state machine, no IO. The Hub feeds it commands and broadcasts views."""

import secrets
import time
import uuid
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel

from app.game import freeinput, jeopardy, music, scoring
from app.game.commands import (
    AdjustScore,
    ApproveRejoin,
    AudioControl,
    DeleteTeam,
    FinishGame,
    Judge,
    NextRound,
    OpenCell,
    RejectRejoin,
    RenameTeam,
    SetOverlay,
    SetSecretRecipient,
    ShowQr,
    StartGame,
    StartRound,
    Undo,
)
from app.game.constants import (  # noqa: F401  (re-exported for callers and tests)
    ANSWER_GRACE,
    FALSE_START_LOCK,
    TEAM_NAME_MAX,
    TIMER_ADD_SECONDS,
    UNDO_LIMIT,
)
from app.game.errors import GameError
from app.game.state import AudioAction, AudioCmd, GameState, RejoinRequest, Team
from app.quizdata import QuestionData, QuizData, RoundData

__all__ = ["Game", "GameError", "JoinResult"]

UNDOABLE = {Judge, OpenCell, SetSecretRecipient, AdjustScore}


class JoinResult(BaseModel):
    status: Literal["joined", "pending"]
    team_id: str
    token: str
    request_id: str | None = None


def _name_key(name: str) -> str:
    return " ".join(name.split()).casefold()


class Game:
    def __init__(self, quiz: QuizData, state: GameState, clock: Callable[[], float] = time.time):
        self.quiz = quiz
        self.state = state
        self.clock = clock

    @classmethod
    def new(cls, quiz: QuizData, clock: Callable[[], float] = time.time) -> "Game":
        return cls(quiz, GameState(quiz_id=quiz.id), clock)

    # ---------- helpers ----------

    def now(self) -> float:
        return self.clock()

    def find_team(self, team_id: str) -> Team | None:
        return next((t for t in self.state.teams if t.id == team_id), None)

    def team(self, team_id: str) -> Team:
        team = self.find_team(team_id)
        if team is None:
            raise GameError("Команда не найдена")
        return team

    def team_by_token(self, token: str) -> Team | None:
        if not token:
            return None
        return next((t for t in self.state.teams if secrets.compare_digest(t.token, token)), None)

    def current_round(self) -> RoundData:
        idx = self.state.round_index
        if not 0 <= idx < len(self.quiz.rounds):
            raise GameError("Тур не начат")
        return self.quiz.rounds[idx]

    def set_audio(self, action: AudioAction) -> None:
        self.state.audio = AudioCmd(action=action, seq=self.state.audio.seq + 1)

    def audio_for(self, question: QuestionData) -> None:
        has_audio = question.media is not None and question.media.kind == "audio"
        self.set_audio("play" if has_audio else "stop")

    def new_music_context(self) -> None:
        self.state.music_seq += 1
        self.state.music_paused = False

    def clean_name(self, name: str, except_team_id: str | None = None) -> str:
        cleaned = " ".join(name.split())
        if not 1 <= len(cleaned) <= TEAM_NAME_MAX:
            raise GameError(f"Введите название (до {TEAM_NAME_MAX} символов)")
        return cleaned

    def team_with_name(self, name: str) -> Team | None:
        key = _name_key(name)
        return next((t for t in self.state.teams if _name_key(t.name) == key), None)

    # ---------- joining ----------

    def join(self, name: str) -> JoinResult:
        cleaned = self.clean_name(name)
        token = secrets.token_urlsafe(16)
        existing = self.team_with_name(cleaned)
        if existing is not None:
            request = RejoinRequest(id=uuid.uuid4().hex, team_id=existing.id, token=token)
            self.state.rejoin_requests.append(request)
            return JoinResult(status="pending", team_id=existing.id, token=token, request_id=request.id)
        team = Team(id=uuid.uuid4().hex, name=cleaned, token=token, joined_at=self.now())
        self.state.teams.append(team)
        return JoinResult(status="joined", team_id=team.id, token=token)

    # ---------- command entry points ----------

    def tick(self) -> bool:
        if self.state.stage == "jeopardy":
            return jeopardy.tick(self)
        if self.state.stage == "free":
            return freeinput.tick(self)
        return False

    def apply_admin(self, cmd) -> None:
        handler = HANDLERS.get(type(cmd))
        if handler is None:
            raise GameError("Неизвестная команда")
        self._transaction(lambda: self._run_admin(handler, cmd))

    def apply_team(self, team_id: str, cmd) -> None:
        handler = TEAM_HANDLERS.get(type(cmd))
        if handler is None:
            raise GameError("Неизвестная команда")
        self._transaction(lambda: (self.team(team_id), handler(self, team_id, cmd)))

    def _run_admin(self, handler, cmd) -> None:
        entry = None
        if isinstance(cmd, AdjustScore):
            # a manual score fix is undone by reverting just that score, never the whole game
            entry = {
                "kind": "score",
                "team_id": cmd.team_id,
                "delta": cmd.delta,
                "round": scoring.adjust_round(self),
            }
        elif type(cmd) in UNDOABLE:
            entry = {"kind": "state", "state": self.state.model_dump(exclude={"undo_stack"})}
        if entry is not None:
            entry["label"] = _undo_label(self, cmd)
        handler(self, cmd)
        if entry is not None:
            self.state.undo_stack.append(entry)
            del self.state.undo_stack[:-UNDO_LIMIT]

    def _transaction(self, fn: Callable[[], object]) -> None:
        """Run fn atomically: on GameError the state is rolled back."""
        self.tick()
        backup = self.state.model_copy(deep=True)
        try:
            fn()
        except GameError:
            self.state = backup
            raise


def _signed(n: int) -> str:
    return f"+{n}" if n >= 0 else f"−{-n}"  # U+2212, as in the console buttons


def _undo_label(game: Game, cmd) -> str:
    """What the console shows on the undo button for this command; "" when the data is missing
    (the handler itself raises the GameError)."""
    j = game.state.jeopardy
    if isinstance(cmd, AdjustScore):
        team = game.find_team(cmd.team_id)
        return f"правка {team.name} {_signed(cmd.delta)}" if team else ""
    if isinstance(cmd, SetSecretRecipient):
        team = game.find_team(cmd.team_id)
        return f"секрет → {team.name}" if team else ""
    if not 0 <= game.state.round_index < len(game.quiz.rounds):
        return ""
    rnd = game.current_round()
    if isinstance(cmd, OpenCell):
        question, category = rnd.find_question(cmd.question_id), rnd.category_of(cmd.question_id)
        return f"открыта {category.name} · {question.value}" if question and category else ""
    if isinstance(cmd, Judge):
        team = game.find_team(j.answering_team_id) if j and j.answering_team_id else None
        question = jeopardy.current_question(game)
        if team is None or question is None:
            return ""
        if cmd.correct:
            return f"✓ {team.name} +{question.value}"
        return f"✗ {team.name} −{question.value}" if rnd.minus_on_wrong else f"✗ {team.name}"
    return ""


# ---------- core handlers ----------


def _show_qr(game: Game, cmd: ShowQr) -> None:
    game.state.qr_visible = cmd.visible


def _start_game(game: Game, cmd: StartGame) -> None:
    if game.state.stage != "lobby":
        raise GameError("Игра уже начата")
    if not game.quiz.rounds:
        raise GameError("В квизе нет туров")
    game.state.stage = "intro"
    game.state.round_index = 0
    game.state.qr_visible = False
    game.state.overlay = None
    game.new_music_context()
    game.state.undo_stack = []


def _start_round(game: Game, cmd: StartRound) -> None:
    if game.state.stage != "intro":
        raise GameError("Тур уже идёт")
    rnd = game.current_round()
    game.state.stage = rnd.kind
    game.state.overlay = None
    game.state.undo_stack = []
    if rnd.kind == "jeopardy":
        jeopardy.start(game)
    else:
        freeinput.start(game)


def _next_round(game: Game, cmd: NextRound) -> None:
    if game.state.stage == "lobby":
        raise GameError("Сначала начните игру")
    if game.state.stage == "finished":
        raise GameError("Игра окончена")
    if game.state.round_index + 1 >= len(game.quiz.rounds):
        raise GameError("Это был последний тур")
    scoring.close_current_round(game)
    game.state.round_index += 1
    game.state.stage = "intro"
    game.state.jeopardy = None
    game.state.free = None
    game.state.overlay = "leaderboard" if game.state.closed_rounds else None
    game.new_music_context()
    game.state.undo_stack = []
    game.set_audio("stop")


def _finish_game(game: Game, cmd: FinishGame) -> None:
    scoring.close_current_round(game)
    game.state.stage = "finished"
    game.state.overlay = None
    game.state.undo_stack = []
    game.set_audio("stop")


def _rename_team(game: Game, cmd: RenameTeam) -> None:
    team = game.team(cmd.team_id)
    name = game.clean_name(cmd.name)
    other = game.team_with_name(name)
    if other is not None and other.id != team.id:
        raise GameError("Команда с таким названием уже есть")
    team.name = name


def _delete_team(game: Game, cmd: DeleteTeam) -> None:
    game.team(cmd.team_id)
    game.state.teams = [t for t in game.state.teams if t.id != cmd.team_id]
    game.state.rejoin_requests = [r for r in game.state.rejoin_requests if r.team_id != cmd.team_id]
    if game.state.jeopardy is not None:
        jeopardy.on_team_deleted(game, cmd.team_id)


def _find_request(game: Game, request_id: str) -> RejoinRequest:
    req = next((r for r in game.state.rejoin_requests if r.id == request_id), None)
    if req is None:
        raise GameError("Запрос не найден")
    return req


def _approve_rejoin(game: Game, cmd: ApproveRejoin) -> None:
    req = _find_request(game, cmd.request_id)
    game.team(req.team_id).token = req.token
    game.state.rejoin_requests = [r for r in game.state.rejoin_requests if r.id != req.id]


def _reject_rejoin(game: Game, cmd: RejectRejoin) -> None:
    req = _find_request(game, cmd.request_id)
    game.state.rejoin_requests = [r for r in game.state.rejoin_requests if r.id != req.id]


def _adjust_score(game: Game, cmd: AdjustScore) -> None:
    if cmd.delta == 0:
        raise GameError("Укажите изменение счёта")
    team = game.team(cmd.team_id)
    round_index = scoring.adjust_round(game)
    if round_index is None:
        raise GameError("Счёт пока нечего править")
    scoring.add_points(team, round_index, cmd.delta)


def _undo(game: Game, cmd: Undo) -> None:
    current = game.state
    if not current.undo_stack:
        raise GameError("Нечего отменять")
    entry = current.undo_stack.pop()
    if entry.get("kind") == "score":
        team = game.find_team(entry["team_id"])
        if team is not None and entry.get("round") is not None:
            scoring.add_points(team, entry["round"], -entry["delta"])
        return
    restored = GameState.model_validate(entry["state"])
    old_scores = {t.id: t.round_scores for t in restored.teams}
    current_ids = {t.id for t in current.teams}
    vanished = [tid for tid in old_scores if tid not in current_ids]
    restored.teams = [t.model_copy(update={"round_scores": old_scores.get(t.id, t.round_scores)}) for t in current.teams]
    restored.rejoin_requests = current.rejoin_requests
    restored.undo_stack = current.undo_stack
    game.state = restored
    if restored.jeopardy is not None:
        for tid in vanished:
            jeopardy.on_team_deleted(game, tid)


def _set_overlay(game: Game, cmd: SetOverlay) -> None:
    game.state.overlay = cmd.overlay


def _audio(game: Game, cmd: AudioControl) -> None:
    game.set_audio(cmd.action)


HANDLERS: dict[type, Callable] = {
    ShowQr: _show_qr,
    StartGame: _start_game,
    StartRound: _start_round,
    NextRound: _next_round,
    FinishGame: _finish_game,
    RenameTeam: _rename_team,
    DeleteTeam: _delete_team,
    ApproveRejoin: _approve_rejoin,
    RejectRejoin: _reject_rejoin,
    AdjustScore: _adjust_score,
    Undo: _undo,
    SetOverlay: _set_overlay,
    AudioControl: _audio,
    **jeopardy.HANDLERS,
    **freeinput.HANDLERS,
    **music.HANDLERS,
}

TEAM_HANDLERS: dict[type, Callable] = {**jeopardy.TEAM_HANDLERS, **freeinput.TEAM_HANDLERS}
