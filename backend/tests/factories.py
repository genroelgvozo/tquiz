"""Test helpers for building quizzes and games without a database."""

from app.game import scoring
from app.game.engine import Game
from app.quizdata import CategoryData, MediaRef, QuestionData, QuizData, RoundData


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def q(id: int, **kw) -> QuestionData:
    data = {"text": f"Вопрос {id}", "answer": f"Ответ {id}", "value": 100, "nominal": 1, "options": []}
    data.update(kw)
    return QuestionData(id=id, **data)


def jeopardy_round(id: int, categories: list[tuple[str, list[QuestionData]]], **settings) -> RoundData:
    cats = [CategoryData(id=id * 100 + i, name=name, questions=qs) for i, (name, qs) in enumerate(categories)]
    return RoundData(id=id, title=f"Тур {id}", kind="jeopardy", categories=cats, **settings)


def free_round(id: int, questions: list[QuestionData], **settings) -> RoundData:
    return RoundData(id=id, title=f"Тур {id}", kind="free", questions=questions, **settings)


def make_quiz(rounds: list[RoundData], logo: MediaRef | None = None) -> QuizData:
    return QuizData(id=1, title="Квиз", logo=logo, rounds=rounds)


def new_game(quiz: QuizData, clock=None) -> Game:
    return Game.new(quiz, clock=clock or FakeClock())


def total(g: Game, team_id: str) -> int:
    return scoring.total(g, g.team(team_id))


def round_score(g: Game, team_id: str) -> int | None:
    return scoring.current_round_score(g, g.team(team_id))
