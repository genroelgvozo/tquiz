import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth import screen_key
from app.main import create_app
from app.ws.hub import screen_sound_status


def build_quiz(c):
    qid = c.post("/api/quizzes", json={"title": "Q"}).json()["quiz"]["id"]
    rnd = c.post(f"/api/quizzes/{qid}/rounds", json={"title": "Ввод", "kind": "free"}).json()["quiz"]["rounds"][0]
    qq = c.post(f"/api/rounds/{rnd['id']}/questions", json={}).json()["quiz"]["rounds"][0]["questions"][0]
    c.patch(f"/api/questions/{qq['id']}", json={"text": "Столица?", "answer": "Париж"})
    return qid


def recv_until(ws, type_):
    while True:
        m = ws.receive_json()
        if m["type"] == type_:
            return m


def wait_view(ws, pred):
    """Sockets of different clients are not ordered relative to each other — wait for the snapshot we need."""
    while True:
        v = recv_until(ws, "state")["view"]
        if v is not None and pred(v):
            return v


def test_full_free_round_flow(admin_client):
    qid = build_quiz(admin_client)
    assert admin_client.post("/api/game/start", json={"quiz_id": qid}).status_code == 204
    with admin_client.websocket_connect("/ws/admin") as adm, admin_client.websocket_connect("/ws/team") as team:
        recv_until(team, "need_join")
        team.send_json({"type": "join", "name": "Котики"})
        assert recv_until(team, "joined")["token"]
        adm.send_json({"type": "start_game"})
        adm.send_json({"type": "start_round"})
        wait_view(team, lambda v: v["stage"] == "free")
        team.send_json({"type": "answer", "text": "париж"})
        wait_view(team, lambda v: v["free"]["answer"]["text"] == "париж")
        adm.send_json({"type": "start_review"})
        v = wait_view(adm, lambda v: v["state"]["free"] and v["state"]["free"]["phase"] == "review")
        assert v["state"]["teams"][0]["round_score"] == 1


def test_error_goes_only_to_sender(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/admin") as adm:
        recv_until(adm, "state")
        adm.send_json({"type": "undo"})
        assert "Нечего" in recv_until(adm, "error")["message"]


def test_team_reconnects_with_token(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/team") as t:
        recv_until(t, "need_join")
        t.send_json({"type": "join", "name": "А"})
        token = recv_until(t, "joined")["token"]
    with admin_client.websocket_connect(f"/ws/team?token={token}") as t:
        assert recv_until(t, "state")["view"]["team"]["name"] == "А"


def test_stale_token_gets_need_join(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/team?token=garbage") as t:
        assert t.receive_json()["type"] == "need_join"


def test_no_game_for_team(client):
    with client.websocket_connect("/ws/team") as t:
        assert t.receive_json()["type"] == "no_game"


def test_rejoin_approval_kicks_old_device(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/admin") as adm, admin_client.websocket_connect(
        "/ws/team"
    ) as old, admin_client.websocket_connect("/ws/team") as new:
        recv_until(old, "need_join")
        old.send_json({"type": "join", "name": "А"})
        recv_until(old, "joined")
        recv_until(new, "need_join")
        new.send_json({"type": "join", "name": "а"})
        recv_until(new, "pending")
        v = wait_view(adm, lambda v: v["state"]["rejoin_requests"])
        adm.send_json({"type": "approve_rejoin", "request_id": v["state"]["rejoin_requests"][0]["id"]})
        assert recv_until(new, "joined")["token"]
        assert recv_until(old, "kicked")


def test_screen_requires_key(client, settings):
    with pytest.raises(WebSocketDisconnect) as e:
        with client.websocket_connect("/ws/screen") as s:
            s.receive_json()
    assert e.value.code == 4401


def test_editor_locked_during_game_and_unlocked_after_stop(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"title": "x"}).status_code == 409
    assert admin_client.post("/api/game/start", json={"quiz_id": qid}).status_code == 409
    admin_client.post("/api/game/stop")
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"title": "x"}).status_code == 200


def test_state_survives_restart(settings, admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/team") as t:
        recv_until(t, "need_join")
        t.send_json({"type": "join", "name": "А"})
        token = recv_until(t, "joined")["token"]
    with TestClient(create_app(settings)) as c2:
        with c2.websocket_connect(f"/ws/team?token={token}") as t:
            assert recv_until(t, "state")["view"]["team"]["name"] == "А"


def test_screen_sound_status_reaches_admin(admin_client, settings):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/admin") as adm:
        wait_view(adm, lambda v: v["screen_sound"] == "none")
        admin_client.post("/api/screen/auth", json={"key": screen_key(settings)})
        with admin_client.websocket_connect("/ws/screen") as screen:
            wait_view(adm, lambda v: v["screen_sound"] == "off")
            screen.send_json({"type": "sound", "on": True})
            wait_view(adm, lambda v: v["screen_sound"] == "on")
        wait_view(adm, lambda v: v["screen_sound"] == "none")


def test_need_join_carries_theme(admin_client):
    qid = build_quiz(admin_client)
    admin_client.post("/api/game/start", json={"quiz_id": qid})
    with admin_client.websocket_connect("/ws/team") as t:
        assert recv_until(t, "need_join")["theme"]["bg"] == "#FBF5EA"


def test_screen_sound_status_any_on():
    assert screen_sound_status([]) == "none"
    assert screen_sound_status([False, True]) == "on"
    assert screen_sound_status([False]) == "off"
