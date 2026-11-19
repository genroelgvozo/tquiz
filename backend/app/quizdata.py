"""Read-only snapshot of a quiz used by the editor API and the game engine."""

from typing import Literal

from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import DEFAULT_CELL_VALUES, Category, Question, Quiz, Round

MediaKind = Literal["image", "audio"]


class MediaRef(BaseModel):
    filename: str
    kind: MediaKind
    url: str


def media_ref(filename: str, kind: MediaKind) -> MediaRef:
    return MediaRef(filename=filename, kind=kind, url=f"/media/{filename}")


class QuestionData(BaseModel):
    id: int
    position: int = 0
    text: str = ""
    answer: str = ""
    media: MediaRef | None = None
    value: int = 0
    is_secret: bool = False
    nominal: int = 1
    options: list[str] = []
    correct_option: int | None = None
    discuss_seconds: int | None = None
    input_seconds: int | None = None


class CategoryData(BaseModel):
    id: int
    name: str
    questions: list[QuestionData] = []


class RoundData(BaseModel):
    id: int
    title: str
    kind: Literal["jeopardy", "free"]
    minus_on_wrong: bool = False
    buzzer_mode: Literal["instant", "bar"] = "bar"
    bar_seconds: int = 5
    discuss_seconds: int = 60
    input_seconds: int = 15
    stakes: bool = False
    cell_values: list[int] = [100, 200, 300, 400, 500]
    categories: list[CategoryData] = []
    questions: list[QuestionData] = []

    def all_questions(self) -> list[QuestionData]:
        if self.kind == "jeopardy":
            return [q for c in self.categories for q in c.questions]
        return list(self.questions)

    def find_question(self, qid: int) -> QuestionData | None:
        return next((q for q in self.all_questions() if q.id == qid), None)

    def category_of(self, qid: int) -> CategoryData | None:
        return next((c for c in self.categories if any(q.id == qid for q in c.questions)), None)


class QuizData(BaseModel):
    id: int
    title: str
    logo: MediaRef | None = None
    rounds: list[RoundData] = []


def _question_data(q: Question) -> QuestionData:
    media = media_ref(q.media_filename, q.media_kind) if q.media_filename and q.media_kind else None
    return QuestionData(
        id=q.id,
        position=q.position,
        text=q.text,
        answer=q.answer,
        media=media,
        value=q.value,
        is_secret=q.is_secret,
        nominal=q.nominal,
        options=list(q.options or []),
        correct_option=q.correct_option,
        discuss_seconds=q.discuss_seconds,
        input_seconds=q.input_seconds,
    )


def load_quiz_data(session: Session, quiz_id: int) -> QuizData:
    quiz = session.get(Quiz, quiz_id)
    if quiz is None:
        raise LookupError(f"quiz {quiz_id} not found")
    rounds = session.exec(select(Round).where(Round.quiz_id == quiz_id).order_by(Round.position, Round.id)).all()
    result: list[RoundData] = []
    for r in rounds:
        questions = session.exec(
            select(Question).where(Question.round_id == r.id).order_by(Question.position, Question.id)
        ).all()
        data = RoundData(
            id=r.id,
            title=r.title,
            kind=r.kind,
            minus_on_wrong=r.minus_on_wrong,
            buzzer_mode=r.buzzer_mode,
            bar_seconds=r.bar_seconds,
            discuss_seconds=r.discuss_seconds,
            input_seconds=r.input_seconds,
            stakes=r.stakes,
            cell_values=list(r.cell_values or DEFAULT_CELL_VALUES),
        )
        if r.kind == "jeopardy":
            cats = session.exec(
                select(Category).where(Category.round_id == r.id).order_by(Category.position, Category.id)
            ).all()
            data.categories = [
                CategoryData(
                    id=c.id,
                    name=c.name,
                    questions=[
                        _question_data(q)
                        for q in sorted(
                            (q for q in questions if q.category_id == c.id),
                            key=lambda q: (q.value, q.position, q.id),
                        )
                    ],
                )
                for c in cats
            ]
        else:
            data.questions = [_question_data(q) for q in questions]
        result.append(data)
    logo = media_ref(quiz.logo_filename, "image") if quiz.logo_filename else None
    return QuizData(id=quiz.id, title=quiz.title, logo=logo, rounds=result)
