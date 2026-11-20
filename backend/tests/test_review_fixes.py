"""Regression tests for findings of the final whole-branch review."""

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.game.commands import *  # noqa: F403
from app.game.engine import Game, GameError
from app.game.views import admin_view, screen_view, team_view
from app.main import create_app
from app.models import ActiveGame
from tests.factories import FakeClock, free_round, jeopardy_round, make_quiz, new_game, q


# ---------- I4: empty secrets must not start an open admin ----------


@pytest.mark.parametrize("password,secret", [("", "x" * 16), ("pw", ""), ("pw", "short")])
def test_settings_reject_empty_or_weak_secrets(tmp_path, password, secret):
    with pytest.raises(ValidationError):
        Settings(admin_password=password, secret_key=secret, data_dir=tmp_path)


# ---------- I2: undoing a score fix must not wipe answers ----------


def _free_game():
    g = new_game(make_quiz([free_round(1, [q(1), q(2)])]), clock=FakeClock())
    a = g.join("А").team_id
    b = g.join("Б").team_id
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    return g, a, b


def test_undo_adjust_score_keeps_free_answers_and_timer():
    g, a, b = _free_game()
    g.apply_admin(TimerStart())
    g.apply_admin(AdjustScore(team_id=a, delta=5))
    g.apply_team(b, SubmitAnswer(text="ответ"))
    g.apply_admin(Undo())
    assert g.team(a).round_scores.get('0', 0) == 0
    assert g.state.free.answers["1"][b].text == "ответ" and g.state.free.timer.status == "running"


# ---------- I5: answers are bound to a question ----------


def test_answer_for_other_question_rejected():
    g, a, b = _free_game()
    g.apply_admin(OpenQuestion(index=1))
    with pytest.raises(GameError):
        g.apply_team(a, SubmitAnswer(question_id=1, text="старый вопрос"))
    g.apply_team(a, SubmitAnswer(question_id=2, text="новый"))
    assert g.state.free.answers["2"][a].text == "новый" and "1" not in g.state.free.answers


def test_team_free_view_exposes_question_id():
    g, a, b = _free_game()
    assert team_view(g, a).free.question_id == 1


# ---------- m2 (re-graded): option questions reveal the correct option on screen ----------


def test_screen_review_shows_correct_option_when_answer_text_empty():
    g = new_game(make_quiz([free_round(1, [q(1, answer="", options=["Моне", "Саврасов"], correct_option=1)])]))
    g.join("А")
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(StartReview())
    g.apply_admin(ReviewShowAnswer())
    assert screen_view(g, "u").free.question.answer == "B. Саврасов"


# ---------- WS-level: I3 stale rejoin, heartbeat; m4 (re-graded) restore ----------


def _recv_until(ws, type_):
    while True:
        m = ws.receive_json()
        if m["type"] == type_:
            return m


def _wait_view(ws, pred):
    while True:
        v = _recv_until(ws, "state")["view"]
        if v is not None and pred(v):
            return v


def _start_quiz(c):
    qid = c.post("/api/quizzes", json={"title": "Q"}).json()["quiz"]["id"]
    rid = c.post(f"/api/quizzes/{qid}/rounds", json={"title": "R", "kind": "free"}).json()["quiz"]["rounds"][0]["id"]
    c.post(f"/api/rounds/{rid}/questions", json={})
    assert c.post("/api/game/start", json={"quiz_id": qid}).status_code == 204


def test_rejoin_request_dropped_when_new_device_disconnects(admin_client):
    _start_quiz(admin_client)
    with admin_client.websocket_connect("/ws/admin") as adm, admin_client.websocket_connect("/ws/team") as old:
        _recv_until(old, "need_join")
        old.send_json({"type": "join", "name": "А"})
        token = _recv_until(old, "joined")["token"]
        with admin_client.websocket_connect("/ws/team") as new:
            _recv_until(new, "need_join")
            new.send_json({"type": "join", "name": "А"})
            _recv_until(new, "pending")
            _wait_view(adm, lambda v: v["state"]["rejoin_requests"])
        _wait_view(adm, lambda v: not v["state"]["rejoin_requests"])
    with admin_client.websocket_connect(f"/ws/team?token={token}") as again:
        assert _recv_until(again, "state")["view"]["team"]["name"] == "А"


def test_ping_gets_pong(admin_client):
    _start_quiz(admin_client)
    with admin_client.websocket_connect("/ws/team") as t:
        _recv_until(t, "need_join")
        t.send_json({"type": "ping"})
        assert _recv_until(t, "pong")
    with admin_client.websocket_connect("/ws/admin") as adm:
        adm.send_json({"type": "ping"})
        assert _recv_until(adm, "pong")


def test_app_starts_when_stored_game_is_invalid(settings):
    with TestClient(create_app(settings)):
        pass
    from sqlmodel import Session

    from app.db import make_engine

    db = make_engine(settings.data_dir)
    with Session(db) as s:
        s.add(ActiveGame(id=1, quiz_id=999, state_json='{"broken": true}', updated_at=0))
        s.commit()
    with TestClient(create_app(settings)) as c:
        assert c.get("/api/health").json() == {"ok": True}
        assert c.app.state.hub.game is None


# ---------- screen polish: a game saved before the new fields loads with their defaults ----------

_OLD_TEAM = {"id": "t1", "name": "А", "token": "tok", "round_scores": {}, "joined_at": 1.0}
_OLD_JEOPARDY = {
    "phase": "question",
    "played": [1],
    "chooser_team_id": "t1",
    "question_id": 1,
    "secret_recipient_id": None,
    "buttons": "open",
    "bar_ends_at": None,
    "lockouts": {},
    "buzzes": [],
    "answering_team_id": None,
    "excluded": [],
}
_OLD_FREE = {
    "phase": "review",
    "index": 0,
    "timer": {"status": "finished", "total_seconds": 60, "input_seconds": 20, "deadline": None, "remaining": 0.0},
    "answers": {},
    "review_index": 0,
    "marks": {},
    "opened": [2],
    "revealed": [],
}


def _old_state(stage: str, round_index: int, jeopardy: dict | None = None, free: dict | None = None) -> dict:
    """GameState as saved before screen polish: no music_seq/music_paused, no printing fields, no answer_shown."""
    return {
        "quiz_id": 1,
        "stage": stage,
        "qr_visible": False,
        "teams": [_OLD_TEAM],
        "rejoin_requests": [],
        "round_index": round_index,
        "closed_rounds": list(range(round_index)),
        "jeopardy": jeopardy,
        "free": free,
        "overlay": None,
        "audio": {"action": "stop", "seq": 3},
    }


_OLD_JEOPARDY_BOARD = {**_OLD_JEOPARDY, "phase": "board", "played": [], "question_id": None, "buttons": "closed"}


@pytest.mark.parametrize(
    "stored",
    [
        {
            **_old_state("jeopardy", 0, jeopardy=_OLD_JEOPARDY),
            "undo_stack": [{"kind": "state", "state": _old_state("jeopardy", 0, jeopardy=_OLD_JEOPARDY_BOARD)}],
        },
        {
            **_old_state("free", 1, free=_OLD_FREE),
            "undo_stack": [{"kind": "state", "state": _old_state("free", 1, free={**_OLD_FREE, "phase": "question"})}],
        },
    ],
    ids=["jeopardy", "free"],
)
def test_old_state_json_loads_with_defaults(settings, stored):
    from sqlmodel import Session

    from app.db import init_db, make_engine
    from app.game import store

    db = make_engine(settings.data_dir)
    init_db(db)
    with Session(db) as s:
        s.add(ActiveGame(id=1, quiz_id=1, state_json=json.dumps(stored), updated_at=0))
        s.commit()
    _, state = store.load_game(db)
    assert (state.music_seq, state.music_paused) == (0, False)
    g = Game(make_quiz([jeopardy_round(1, [("К", [q(1)])]), free_round(2, [q(2)])]), state, FakeClock())
    # every role's snapshot is built from the old state
    screen_view(g, "u")
    team_view(g, "t1")
    admin_view(g, "u", set())
    g.apply_admin(Undo())  # the old undo entry restores too
    old = stored["undo_stack"][0]["state"]
    assert (g.state.jeopardy or g.state.free).phase == (old["jeopardy"] or old["free"])["phase"]
    for st in (state, g.state):
        if st.jeopardy is not None:
            assert (st.jeopardy.starts_at, st.jeopardy.typed_base, st.jeopardy.typing_since) == (None, 0.0, None)
        if st.free is not None:
            assert st.free.answer_shown is False
    assert g.state.stage == stored["stage"] and g.state.music_seq == 0
