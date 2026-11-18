"""Regression tests for findings of the final whole-branch review."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.views import screen_view, team_view
from app.main import create_app
from app.models import ActiveGame
from tests.factories import FakeClock, free_round, make_quiz, new_game, q


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
    assert g.team(a).score == 0
    assert g.state.free.answers["1"][b].text == "ответ" and g.state.free.timer.status == "running"


def test_start_game_clears_undo_stack():
    g = new_game(make_quiz([free_round(1, [q(1)])]))
    a = g.join("А").team_id
    g.apply_admin(AdjustScore(team_id=a, delta=1))
    g.apply_admin(StartGame())
    assert g.state.undo_stack == []


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
