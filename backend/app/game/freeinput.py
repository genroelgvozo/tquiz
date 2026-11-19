"""«Свободный ввод» round logic."""

from typing import TYPE_CHECKING

from app.game.commands import (
    Mark,
    OpenQuestion,
    ReviewGoto,
    StartReview,
    SubmitAnswer,
    TimerAdd,
    TimerFinish,
    TimerPause,
    TimerResume,
    TimerStart,
)
from app.game.constants import ANSWER_GRACE, TIMER_ADD_SECONDS
from app.game.errors import GameError
from app.game.state import Answer, FreeState, Timer
from app.game.text import normalize_answer
from app.quizdata import QuestionData, RoundData

if TYPE_CHECKING:
    from app.game.engine import Game

ANSWER_MAX_LEN = 500


# ---------- pure helpers ----------


def premark(question: QuestionData, answer: Answer | None) -> bool | None:
    if answer is None or (not answer.text.strip() and answer.option is None):
        return False
    if question.options:
        return answer.option == question.correct_option
    return True if normalize_answer(answer.text) == normalize_answer(question.answer) else None


def points(nominal: int, stake: bool, mark: bool | None) -> int:
    if mark is True:
        return nominal * (2 if stake else 1)
    if mark is False:
        return -nominal if stake else 0
    return 0


def round_points(game: "Game") -> dict[str, int]:
    """Points of the current free round per team, computed from the marks."""
    free = game.state.free
    result: dict[str, int] = {}
    if free is None:
        return result
    for question in game.current_round().questions:
        key = str(question.id)
        answers = free.answers.get(key, {})
        marks = free.marks.get(key, {})
        for team in game.state.teams:
            answer = answers.get(team.id)
            mark = marks.get(team.id) if answer else False
            result[team.id] = result.get(team.id, 0) + points(
                question.nominal, answer.stake if answer else False, mark
            )
    return result


def _timer_for(rnd: RoundData, question: QuestionData) -> Timer:
    input_seconds = question.input_seconds if question.input_seconds is not None else rnd.input_seconds
    discuss = question.discuss_seconds if question.discuss_seconds is not None else rnd.discuss_seconds
    return Timer(total_seconds=discuss + input_seconds, input_seconds=input_seconds)


# ---------- state accessors ----------


def _free(game: "Game") -> FreeState:
    if game.state.stage != "free" or game.state.free is None:
        raise GameError("Сейчас не тур со свободным вводом")
    return game.state.free


def current_question(game: "Game") -> QuestionData:
    free = _free(game)
    return game.current_round().questions[free.index]


def review_question(game: "Game") -> QuestionData:
    free = _free(game)
    return game.current_round().questions[free.review_index]


def input_open(game: "Game") -> bool:
    free = game.state.free
    return free is not None and free.phase == "question" and free.timer.status != "finished"


def accepts_answers(game: "Game") -> bool:
    free = game.state.free
    if free is None or game.state.stage != "free" or free.phase != "question":
        return False
    if free.timer.status != "finished":
        return True
    return free.timer.deadline is not None and game.now() <= free.timer.deadline + ANSWER_GRACE


def _open(game: "Game", index: int) -> None:
    rnd = game.current_round()
    if not 0 <= index < len(rnd.questions):
        raise GameError("Нет такого вопроса")
    free = game.state.free
    question = rnd.questions[index]
    free.index = index
    free.timer = _timer_for(rnd, question)
    game.audio_for(question)


# ---------- lifecycle ----------


def start(game: "Game") -> None:
    rnd = game.current_round()
    if not rnd.questions:
        raise GameError("В туре нет вопросов")
    game.state.free = FreeState(timer=_timer_for(rnd, rnd.questions[0]))
    _open(game, 0)


def tick(game: "Game") -> bool:
    free = game.state.free
    if free is None or free.phase != "question":
        return False
    t = free.timer
    if t.status == "running" and t.deadline is not None and game.now() >= t.deadline:
        t.status = "finished"
        return True
    return False


# ---------- host handlers ----------


def _open_question(game: "Game", cmd: OpenQuestion) -> None:
    if _free(game).phase != "question":
        raise GameError("Идёт разбор")
    _open(game, cmd.index)


def _timer_start(game: "Game", cmd: TimerStart) -> None:
    t = _free(game).timer
    if t.status != "idle":
        raise GameError("Таймер уже запускали")
    t.status = "running"
    t.deadline = game.now() + t.total_seconds


def _timer_pause(game: "Game", cmd: TimerPause) -> None:
    t = _free(game).timer
    if t.status != "running":
        raise GameError("Таймер не идёт")
    t.remaining = t.deadline - game.now()
    t.deadline = None
    t.status = "paused"


def _timer_resume(game: "Game", cmd: TimerResume) -> None:
    t = _free(game).timer
    if t.status != "paused":
        raise GameError("Таймер не на паузе")
    t.deadline = game.now() + t.remaining
    t.remaining = None
    t.status = "running"


def _timer_add(game: "Game", cmd: TimerAdd) -> None:
    t = _free(game).timer
    if t.status == "running":
        t.deadline += TIMER_ADD_SECONDS
    elif t.status == "paused":
        t.remaining += TIMER_ADD_SECONDS
    else:
        raise GameError("Таймер не идёт")


def _timer_finish(game: "Game", cmd: TimerFinish) -> None:
    t = _free(game).timer
    if t.status == "finished":
        raise GameError("Таймер уже закончился")
    t.status = "finished"
    t.deadline = game.now()
    t.remaining = None


def _enter_review(game: "Game", index: int) -> None:
    rnd = game.current_round()
    if not 0 <= index < len(rnd.questions):
        raise GameError("Нет такого вопроса")
    free = game.state.free
    free.review_index = index
    question = rnd.questions[index]
    if question.id in free.reviewed:
        return
    key = str(question.id)
    answers = free.answers.get(key, {})
    marks = free.marks.setdefault(key, {})
    for team in game.state.teams:
        answer = answers.get(team.id)
        mark = premark(question, answer)
        marks[team.id] = mark
    free.reviewed.append(question.id)


def _start_review(game: "Game", cmd: StartReview) -> None:
    free = _free(game)
    if free.phase == "review":
        raise GameError("Разбор уже идёт")
    free.phase = "review"
    game.set_audio("stop")
    _enter_review(game, 0)


def _review_goto(game: "Game", cmd: ReviewGoto) -> None:
    if _free(game).phase != "review":
        raise GameError("Разбор ещё не начат")
    _enter_review(game, cmd.index)


def _mark(game: "Game", cmd: Mark) -> None:
    free = _free(game)
    if cmd.question_id not in free.reviewed:
        raise GameError("Сначала откройте вопрос в разборе")
    game.current_round().find_question(cmd.question_id)
    game.team(cmd.team_id)
    key = str(cmd.question_id)
    marks = free.marks.setdefault(key, {})
    marks[cmd.team_id] = cmd.correct


# ---------- team handlers ----------


def _submit(game: "Game", team_id: str, cmd: SubmitAnswer) -> None:
    if not accepts_answers(game):
        raise GameError("Приём ответов закрыт")
    rnd = game.current_round()
    question = current_question(game)
    if cmd.question_id is not None and cmd.question_id != question.id:
        raise GameError("Вопрос уже сменился")
    if question.options:
        if cmd.option is None or not 0 <= cmd.option < len(question.options):
            raise GameError("Выберите вариант")
        answer = Answer(option=cmd.option, stake=cmd.stake and rnd.stakes)
    else:
        answer = Answer(text=cmd.text[:ANSWER_MAX_LEN], stake=cmd.stake and rnd.stakes)
    game.state.free.answers.setdefault(str(question.id), {})[team_id] = answer


HANDLERS: dict = {
    OpenQuestion: _open_question,
    TimerStart: _timer_start,
    TimerPause: _timer_pause,
    TimerResume: _timer_resume,
    TimerAdd: _timer_add,
    TimerFinish: _timer_finish,
    StartReview: _start_review,
    ReviewGoto: _review_goto,
    Mark: _mark,
}

TEAM_HANDLERS: dict = {SubmitAnswer: _submit}
