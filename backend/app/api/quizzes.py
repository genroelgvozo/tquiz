"""Quiz editor REST API. Every mutation inside a quiz returns the full EditorPayload."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, SQLModel, func, select

from app.auth import require_admin
from app.db import get_session
from app.models import DEFAULT_CELL_VALUES, Category, Question, Quiz, Round
from app.api.media import media_kind_of
from app.quizdata import Theme, load_quiz_data

router = APIRouter(dependencies=[Depends(require_admin)])

LOCKED_DETAIL = "Идёт игра по этому квизу — редактирование недоступно"


# ---------- request bodies ----------


class QuizCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class QuizUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    logo_filename: str | None = None
    theme: Theme | None = None
    background_filename: str | None = None
    lobby_music_filename: str | None = None


class RoundCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    kind: Literal["jeopardy", "free"]
    cell_values: list[int] | None = None
    categories: list[Annotated[str, Field(max_length=200)]] = []


class RoundUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    minus_on_wrong: bool | None = None
    buzzer_mode: Literal["instant", "bar"] | None = None
    bar_seconds: int | None = Field(default=None, ge=0, le=600)
    discuss_seconds: int | None = Field(default=None, ge=0, le=3600)
    input_seconds: int | None = Field(default=None, ge=0, le=3600)
    stakes: bool | None = None
    cell_values: list[int] | None = None
    background_filename: str | None = None
    intro_music_filename: str | None = None
    think_music_filename: str | None = None
    typewriter: bool | None = None
    type_speed: int | None = Field(default=None, ge=1, le=100)


class CategoryCreate(BaseModel):
    name: str = Field(default="", max_length=200)


class CategoryUpdate(BaseModel):
    name: str = Field(max_length=200)


class QuestionCreate(BaseModel):
    category_id: int | None = None


class QuestionUpdate(BaseModel):
    text: str | None = None
    answer: str | None = None
    media_filename: str | None = None
    media_kind: Literal["image", "audio"] | None = None
    value: int | None = None
    is_secret: bool | None = None
    nominal: int | None = Field(default=None, ge=0)
    options: list[str] | None = None
    correct_option: int | None = None
    discuss_seconds: int | None = Field(default=None, ge=0, le=3600)
    input_seconds: int | None = Field(default=None, ge=0, le=3600)


class MoveBody(BaseModel):
    delta: Literal[-1, 1]


# ---------- helpers ----------


def _is_locked(request: Request, quiz_id: int) -> bool:
    return request.app.state.locked_quiz_id() == quiz_id


def _ensure_unlocked(request: Request, quiz_id: int) -> None:
    if _is_locked(request, quiz_id):
        raise HTTPException(409, LOCKED_DETAIL)


def _payload(session: Session, request: Request, quiz_id: int) -> dict:
    return {"quiz": load_quiz_data(session, quiz_id).model_dump(), "locked": _is_locked(request, quiz_id)}


def _get(session: Session, model: type[SQLModel], obj_id: int):
    obj = session.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, "Не найдено")
    return obj


def _round_of_category(session: Session, cat: Category) -> Round:
    return _get(session, Round, cat.round_id)


def _next_position(session: Session, model, *conditions) -> int:
    current = session.exec(select(func.max(model.position)).where(*conditions)).one()
    return (current or 0) + 1


def _move(session: Session, obj, siblings: list, delta: int) -> None:
    ids = [s.id for s in siblings]
    i = ids.index(obj.id)
    j = i + delta
    if 0 <= j < len(siblings):
        # normalise positions first so swapping is always meaningful
        for pos, s in enumerate(siblings):
            s.position = pos
        siblings[i].position, siblings[j].position = j, i
        for s in siblings:
            session.add(s)
        session.commit()


def _delete_round_children(session: Session, round_id: int) -> None:
    for q in session.exec(select(Question).where(Question.round_id == round_id)).all():
        session.delete(q)
    for c in session.exec(select(Category).where(Category.round_id == round_id)).all():
        session.delete(c)


def _clean_cell_values(values: list[int]) -> list[int]:
    cleaned = sorted(set(values))
    if not cleaned:
        raise HTTPException(422, "Укажите хотя бы одну стоимость")
    if len(cleaned) > 20:
        raise HTTPException(422, "Не больше 20 стоимостей")
    return cleaned


def next_cell_value(existing: list[int], cell_values: list[int]) -> int:
    for v in cell_values:
        if v not in existing:
            return v
    step = cell_values[-1] - cell_values[-2] if len(cell_values) >= 2 else cell_values[0]
    return max(existing) + step


def _add_category(session: Session, rnd: Round, name: str) -> None:
    pos = _next_position(session, Category, Category.round_id == rnd.id)
    cat = Category(round_id=rnd.id, name=name, position=pos)
    session.add(cat)
    session.flush()
    for i, value in enumerate(rnd.cell_values, start=1):
        session.add(Question(round_id=rnd.id, category_id=cat.id, position=i, value=value))


BACKGROUND_FIELDS = {"background_filename"}
MUSIC_FIELDS = {"lobby_music_filename", "intro_music_filename", "think_music_filename"}


def _check_media_field(key: str, filename: str | None) -> None:
    if filename is None:
        return
    if key in BACKGROUND_FIELDS and media_kind_of(filename) != "image":
        raise HTTPException(422, "Фон должен быть картинкой")
    if key in MUSIC_FIELDS and media_kind_of(filename) != "audio":
        raise HTTPException(422, "Музыка должна быть аудиофайлом")


def _validate_question(q: Question) -> None:
    opts = q.options or []
    if opts and not (2 <= len(opts) <= 4 and all(o.strip() for o in opts)):
        raise HTTPException(422, "Вариантов должно быть от 2 до 4, все непустые")
    if q.correct_option is not None and not (0 <= q.correct_option < len(opts)):
        raise HTTPException(422, "Правильный вариант должен быть одним из вариантов")
    if q.media_filename and q.media_kind not in ("image", "audio"):
        raise HTTPException(422, "Не указан тип медиа")


# ---------- quizzes ----------


@router.get("/api/quizzes")
def list_quizzes(request: Request, session: Session = Depends(get_session)) -> list[dict]:
    quizzes = session.exec(select(Quiz).order_by(Quiz.id)).all()
    return [{"id": q.id, "title": q.title, "locked": _is_locked(request, q.id)} for q in quizzes]


@router.post("/api/quizzes")
def create_quiz(body: QuizCreate, request: Request, session: Session = Depends(get_session)) -> dict:
    quiz = Quiz(title=body.title)
    session.add(quiz)
    session.commit()
    return _payload(session, request, quiz.id)


@router.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, request: Request, session: Session = Depends(get_session)) -> dict:
    _get(session, Quiz, quiz_id)
    return _payload(session, request, quiz_id)


@router.patch("/api/quizzes/{quiz_id}")
def update_quiz(quiz_id: int, body: QuizUpdate, request: Request, session: Session = Depends(get_session)) -> dict:
    quiz = _get(session, Quiz, quiz_id)
    _ensure_unlocked(request, quiz_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if key in ("title", "theme") and value is None:
            continue
        _check_media_field(key, value)
        setattr(quiz, key, value)
    session.add(quiz)
    session.commit()
    return _payload(session, request, quiz_id)


@router.delete("/api/quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, request: Request, session: Session = Depends(get_session)) -> Response:
    quiz = _get(session, Quiz, quiz_id)
    _ensure_unlocked(request, quiz_id)
    for r in session.exec(select(Round).where(Round.quiz_id == quiz_id)).all():
        _delete_round_children(session, r.id)
        session.delete(r)
    session.delete(quiz)
    session.commit()
    return Response(status_code=204)


@router.post("/api/quizzes/{quiz_id}/copy")
def copy_quiz(quiz_id: int, request: Request, session: Session = Depends(get_session)) -> dict:
    src = _get(session, Quiz, quiz_id)
    new_quiz = Quiz(
        title=f"{src.title} (копия)",
        logo_filename=src.logo_filename,
        theme=dict(src.theme),
        background_filename=src.background_filename,
        lobby_music_filename=src.lobby_music_filename,
    )
    session.add(new_quiz)
    session.flush()
    rounds = session.exec(select(Round).where(Round.quiz_id == quiz_id)).all()
    for r in rounds:
        nr = Round(**r.model_dump(exclude={"id", "quiz_id"}), quiz_id=new_quiz.id)
        session.add(nr)
        session.flush()
        cat_map: dict[int, int] = {}
        for c in session.exec(select(Category).where(Category.round_id == r.id)).all():
            nc = Category(**c.model_dump(exclude={"id", "round_id"}), round_id=nr.id)
            session.add(nc)
            session.flush()
            cat_map[c.id] = nc.id
        for q in session.exec(select(Question).where(Question.round_id == r.id)).all():
            data = q.model_dump(exclude={"id", "round_id", "category_id"})
            data["options"] = list(q.options or [])
            session.add(Question(**data, round_id=nr.id, category_id=cat_map.get(q.category_id)))
    session.commit()
    return _payload(session, request, new_quiz.id)


# ---------- rounds ----------


@router.post("/api/quizzes/{quiz_id}/rounds")
def create_round(quiz_id: int, body: RoundCreate, request: Request, session: Session = Depends(get_session)) -> dict:
    _get(session, Quiz, quiz_id)
    _ensure_unlocked(request, quiz_id)
    pos = _next_position(session, Round, Round.quiz_id == quiz_id)
    names = [n.strip() for n in body.categories if n.strip()]
    if names and body.kind != "jeopardy":
        raise HTTPException(422, "Темы есть только в своей игре")
    values = _clean_cell_values(body.cell_values) if body.cell_values is not None else list(DEFAULT_CELL_VALUES)
    rnd = Round(quiz_id=quiz_id, title=body.title, kind=body.kind, position=pos, cell_values=values)
    session.add(rnd)
    session.flush()
    for name in names:
        _add_category(session, rnd, name)
    session.commit()
    return _payload(session, request, quiz_id)


@router.patch("/api/rounds/{round_id}")
def update_round(round_id: int, body: RoundUpdate, request: Request, session: Session = Depends(get_session)) -> dict:
    rnd = _get(session, Round, round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key not in BACKGROUND_FIELDS | MUSIC_FIELDS:
            continue
        _check_media_field(key, value)
        if key == "cell_values":
            value = _clean_cell_values(value)
        setattr(rnd, key, value)
    session.add(rnd)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.delete("/api/rounds/{round_id}")
def delete_round(round_id: int, request: Request, session: Session = Depends(get_session)) -> dict:
    rnd = _get(session, Round, round_id)
    quiz_id = rnd.quiz_id
    _ensure_unlocked(request, quiz_id)
    _delete_round_children(session, round_id)
    session.delete(rnd)
    session.commit()
    return _payload(session, request, quiz_id)


@router.post("/api/rounds/{round_id}/move")
def move_round(round_id: int, body: MoveBody, request: Request, session: Session = Depends(get_session)) -> dict:
    rnd = _get(session, Round, round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    siblings = session.exec(select(Round).where(Round.quiz_id == rnd.quiz_id).order_by(Round.position, Round.id)).all()
    _move(session, rnd, list(siblings), body.delta)
    return _payload(session, request, rnd.quiz_id)


# ---------- categories ----------


@router.post("/api/rounds/{round_id}/categories")
def create_category(round_id: int, body: CategoryCreate, request: Request, session: Session = Depends(get_session)) -> dict:
    rnd = _get(session, Round, round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    if rnd.kind != "jeopardy":
        raise HTTPException(422, "Темы есть только в своей игре")
    _add_category(session, rnd, body.name)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.patch("/api/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate, request: Request, session: Session = Depends(get_session)) -> dict:
    cat = _get(session, Category, category_id)
    rnd = _round_of_category(session, cat)
    _ensure_unlocked(request, rnd.quiz_id)
    cat.name = body.name
    session.add(cat)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.delete("/api/categories/{category_id}")
def delete_category(category_id: int, request: Request, session: Session = Depends(get_session)) -> dict:
    cat = _get(session, Category, category_id)
    rnd = _round_of_category(session, cat)
    _ensure_unlocked(request, rnd.quiz_id)
    for q in session.exec(select(Question).where(Question.category_id == category_id)).all():
        session.delete(q)
    session.delete(cat)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.post("/api/categories/{category_id}/move")
def move_category(category_id: int, body: MoveBody, request: Request, session: Session = Depends(get_session)) -> dict:
    cat = _get(session, Category, category_id)
    rnd = _round_of_category(session, cat)
    _ensure_unlocked(request, rnd.quiz_id)
    siblings = session.exec(
        select(Category).where(Category.round_id == cat.round_id).order_by(Category.position, Category.id)
    ).all()
    _move(session, cat, list(siblings), body.delta)
    return _payload(session, request, rnd.quiz_id)


# ---------- questions ----------


@router.post("/api/rounds/{round_id}/questions")
def create_question(round_id: int, body: QuestionCreate, request: Request, session: Session = Depends(get_session)) -> dict:
    rnd = _get(session, Round, round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    if rnd.kind == "jeopardy":
        if body.category_id is None:
            raise HTTPException(422, "Укажите тему")
        cat = _get(session, Category, body.category_id)
        if cat.round_id != round_id:
            raise HTTPException(422, "Тема из другого тура")
        existing = list(session.exec(select(Question.value).where(Question.category_id == cat.id)).all())
        pos = _next_position(session, Question, Question.category_id == cat.id)
        question = Question(round_id=round_id, category_id=cat.id, position=pos, value=next_cell_value(existing, rnd.cell_values))
    else:
        if body.category_id is not None:
            raise HTTPException(422, "В туре со свободным вводом нет тем")
        pos = _next_position(session, Question, Question.round_id == round_id)
        question = Question(round_id=round_id, position=pos)
    session.add(question)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.patch("/api/questions/{question_id}")
def update_question(question_id: int, body: QuestionUpdate, request: Request, session: Session = Depends(get_session)) -> dict:
    question = _get(session, Question, question_id)
    rnd = _get(session, Round, question.round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key in ("text", "answer", "value", "is_secret", "nominal") and value is None:
            continue
        if key == "options":
            value = [o.strip() for o in (value or [])]
        setattr(question, key, value)
    if not question.options:
        question.correct_option = None
    if not question.media_filename:
        question.media_filename = None
        question.media_kind = None
    _validate_question(question)
    session.add(question)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.delete("/api/questions/{question_id}")
def delete_question(question_id: int, request: Request, session: Session = Depends(get_session)) -> dict:
    question = _get(session, Question, question_id)
    rnd = _get(session, Round, question.round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    session.delete(question)
    session.commit()
    return _payload(session, request, rnd.quiz_id)


@router.post("/api/questions/{question_id}/move")
def move_question(question_id: int, body: MoveBody, request: Request, session: Session = Depends(get_session)) -> dict:
    question = _get(session, Question, question_id)
    rnd = _get(session, Round, question.round_id)
    _ensure_unlocked(request, rnd.quiz_id)
    cond = (
        Question.category_id == question.category_id
        if question.category_id is not None
        else Question.round_id == question.round_id
    )
    siblings = session.exec(select(Question).where(cond).order_by(Question.position, Question.id)).all()
    _move(session, question, list(siblings), body.delta)
    return _payload(session, request, rnd.quiz_id)
