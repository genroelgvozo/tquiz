"""«Своя игра» round logic."""

from typing import TYPE_CHECKING, Literal

from app.game import scoring
from app.game.commands import BuzzCmd, Judge, OpenButtons, OpenCell, Reveal, SetChooser, SetSecretRecipient, ToBoard
from app.game.constants import FALSE_START_LOCK
from app.game.errors import GameError
from app.game.state import Buzz, JeopardyState
from app.quizdata import QuestionData

if TYPE_CHECKING:
    from app.game.engine import Game

BuzzerStatus = Literal["closed", "bar", "open", "locked_out", "answering_me", "answering_other", "excluded"]


def _j(game: "Game") -> JeopardyState:
    if game.state.stage != "jeopardy" or game.state.jeopardy is None:
        raise GameError("Сейчас не своя игра")
    return game.state.jeopardy


def current_question(game: "Game") -> QuestionData | None:
    j = game.state.jeopardy
    if j is None or j.question_id is None:
        return None
    return game.current_round().find_question(j.question_id)


def _has_audio(question: QuestionData | None) -> bool:
    return question is not None and question.media is not None and question.media.kind == "audio"


def _after_wrong(game: "Game", j: JeopardyState) -> None:
    """Nobody is answering any more: either reopen buttons for the rest or end the question."""
    everyone_out = all(t.id in j.excluded for t in game.state.teams)
    if j.secret_recipient_id is not None or everyone_out:
        j.phase = "answer"
        j.buttons = "closed"
    else:
        j.buttons = "open"
        j.bar_ends_at = None
        j.buzzes = []
        j.lockouts = {}


# ---------- lifecycle ----------


def start(game: "Game") -> None:
    teams = game.state.teams
    chooser = min(teams, key=lambda t: (scoring.total(game, t), t.joined_at)).id if teams else None
    game.state.jeopardy = JeopardyState(chooser_team_id=chooser)


def tick(game: "Game") -> bool:
    j = game.state.jeopardy
    if j is None or j.buttons != "bar" or j.bar_ends_at is None:
        return False
    if game.now() >= j.bar_ends_at:
        j.buttons = "open"
        j.bar_ends_at = None
        return True
    return False


def on_team_deleted(game: "Game", team_id: str) -> None:
    j = game.state.jeopardy
    if j is None:
        return
    j.excluded = [t for t in j.excluded if t != team_id]
    j.lockouts.pop(team_id, None)
    j.buzzes = [b for b in j.buzzes if b.team_id != team_id]
    if j.chooser_team_id == team_id:
        j.chooser_team_id = None
    if j.answering_team_id == team_id:
        j.answering_team_id = None
        _after_wrong(game, j)


def buzzer_status(game: "Game", team_id: str) -> BuzzerStatus:
    j = game.state.jeopardy
    if j is None or j.phase != "question":
        return "closed"
    if j.answering_team_id == team_id:
        return "answering_me"
    if j.answering_team_id is not None:
        return "answering_other"
    if team_id in j.excluded:
        return "excluded"
    if j.lockouts.get(team_id, 0) > game.now():
        return "locked_out"
    if j.buttons == "bar":
        return "bar"
    if j.buttons == "open":
        return "open"
    return "closed"


# ---------- host handlers ----------


def _set_chooser(game: "Game", cmd: SetChooser) -> None:
    j = _j(game)
    if j.phase not in ("board", "answer"):
        raise GameError("Сейчас нельзя сменить выбирающего")
    game.team(cmd.team_id)
    j.chooser_team_id = cmd.team_id


def _open_cell(game: "Game", cmd: OpenCell) -> None:
    j = _j(game)
    if j.phase not in ("board", "answer"):
        raise GameError("Сначала завершите текущий вопрос")
    rnd = game.current_round()
    question = rnd.find_question(cmd.question_id)
    if question is None:
        raise GameError("Нет такого вопроса")
    if question.id in j.played:
        raise GameError("Вопрос уже сыгран")
    j.played.append(question.id)
    j.question_id = question.id
    j.excluded = []
    j.buzzes = []
    j.lockouts = {}
    j.answering_team_id = None
    j.secret_recipient_id = None
    j.bar_ends_at = None
    if question.is_secret:
        j.phase = "secret"
        j.buttons = "closed"
    else:
        j.phase = "question"
        if rnd.buzzer_mode == "instant":
            j.buttons = "open"
        else:
            j.buttons = "bar"
            j.bar_ends_at = game.now() + rnd.bar_seconds
    game.audio_for(question)


def _set_secret_recipient(game: "Game", cmd: SetSecretRecipient) -> None:
    j = _j(game)
    if j.phase != "secret":
        raise GameError("Сейчас не вопрос-секрет")
    game.team(cmd.team_id)
    if cmd.team_id == j.chooser_team_id:
        raise GameError("Секрет нужно отдать другой команде")
    j.secret_recipient_id = cmd.team_id
    j.answering_team_id = cmd.team_id
    j.phase = "question"
    j.buttons = "closed"


def _open_buttons(game: "Game", cmd: OpenButtons) -> None:
    j = _j(game)
    if j.buttons != "bar":
        raise GameError("Кнопки уже открыты")
    j.buttons = "open"
    j.bar_ends_at = None


def _judge(game: "Game", cmd: Judge) -> None:
    j = _j(game)
    if j.phase != "question" or j.answering_team_id is None:
        raise GameError("Никто не отвечает")
    question = current_question(game)
    team = game.team(j.answering_team_id)
    if cmd.correct:
        scoring.add_points(team, game.state.round_index, question.value)
        j.chooser_team_id = team.id
        j.phase = "answer"
        j.buttons = "closed"
    else:
        if game.current_round().minus_on_wrong:
            scoring.add_points(team, game.state.round_index, -question.value)
        j.excluded.append(team.id)
        j.answering_team_id = None
        _after_wrong(game, j)


def _reveal(game: "Game", cmd: Reveal) -> None:
    j = _j(game)
    if j.phase not in ("question", "secret"):
        raise GameError("Вопрос не открыт")
    j.phase = "answer"
    j.buttons = "closed"
    j.answering_team_id = None


def _to_board(game: "Game", cmd: ToBoard) -> None:
    j = _j(game)
    j.phase = "board"
    j.question_id = None
    j.buttons = "closed"
    j.bar_ends_at = None
    j.answering_team_id = None
    j.secret_recipient_id = None
    game.set_audio("stop")


# ---------- team handlers ----------


def _buzz(game: "Game", team_id: str, cmd: BuzzCmd) -> None:
    """Buzzing never raises: presses at the wrong moment are simply ignored."""
    j = game.state.jeopardy
    if game.state.stage != "jeopardy" or j is None or j.phase != "question":
        return
    if j.secret_recipient_id is not None or team_id in j.excluded:
        return
    now = game.now()
    if j.buttons == "bar":
        j.lockouts[team_id] = now + FALSE_START_LOCK
    elif j.buttons == "open":
        if j.lockouts.get(team_id, 0) > now:
            return
        j.answering_team_id = team_id
        j.buttons = "locked"
        j.buzzes.append(Buzz(team_id=team_id, at=now))
        if _has_audio(current_question(game)):
            game.set_audio("pause")
    elif j.buttons == "locked":
        if team_id != j.answering_team_id and all(b.team_id != team_id for b in j.buzzes):
            j.buzzes.append(Buzz(team_id=team_id, at=now))


HANDLERS: dict = {
    SetChooser: _set_chooser,
    OpenCell: _open_cell,
    SetSecretRecipient: _set_secret_recipient,
    OpenButtons: _open_buttons,
    Judge: _judge,
    Reveal: _reveal,
    ToBoard: _to_board,
}

TEAM_HANDLERS: dict = {BuzzCmd: _buzz}
