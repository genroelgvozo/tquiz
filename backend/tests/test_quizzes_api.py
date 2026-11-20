import json
import sqlite3

from app.api.quizzes import next_cell_value
from app.db import init_db, make_engine


def make_quiz(c):
    q = c.post("/api/quizzes", json={"title": "Пятничный"}).json()["quiz"]
    return q["id"]


def test_requires_admin(client):
    assert client.get("/api/quizzes").status_code == 401


def test_create_jeopardy_round_with_category_and_questions(admin_client):
    qid = make_quiz(admin_client)
    p = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "Своя", "kind": "jeopardy"}).json()
    rnd = p["quiz"]["rounds"][0]
    assert rnd["buzzer_mode"] == "bar" and rnd["bar_seconds"] == 5 and rnd["minus_on_wrong"] is False
    p = admin_client.post(f"/api/rounds/{rnd['id']}/categories", json={"name": "Кино"}).json()
    cat = p["quiz"]["rounds"][0]["categories"][0]
    assert [q["value"] for q in cat["questions"]] == [100, 200, 300, 400, 500]
    p = admin_client.post(f"/api/rounds/{rnd['id']}/questions", json={"category_id": cat["id"]}).json()
    assert [q["value"] for q in p["quiz"]["rounds"][0]["categories"][0]["questions"]] == [100, 200, 300, 400, 500, 600]


def test_free_round_defaults_and_options_validation(admin_client):
    qid = make_quiz(admin_client)
    rnd = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "Ввод", "kind": "free"}).json()["quiz"]["rounds"][0]
    assert (rnd["discuss_seconds"], rnd["input_seconds"], rnd["stakes"]) == (60, 15, False)
    q = admin_client.post(f"/api/rounds/{rnd['id']}/questions", json={}).json()["quiz"]["rounds"][0]["questions"][0]
    assert q["nominal"] == 1
    assert admin_client.patch(f"/api/questions/{q['id']}", json={"options": ["A"]}).status_code == 422
    assert admin_client.patch(f"/api/questions/{q['id']}", json={"options": ["A", "B"], "correct_option": 2}).status_code == 422
    ok = admin_client.patch(f"/api/questions/{q['id']}", json={"options": ["A", "B"], "correct_option": 1})
    assert ok.status_code == 200


def test_move_round(admin_client):
    qid = make_quiz(admin_client)
    admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "1", "kind": "free"})
    p = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "2", "kind": "free"}).json()
    second = p["quiz"]["rounds"][1]["id"]
    p = admin_client.post(f"/api/rounds/{second}/move", json={"delta": -1}).json()
    assert [r["title"] for r in p["quiz"]["rounds"]] == ["2", "1"]


def test_copy_quiz_deep(admin_client):
    qid = make_quiz(admin_client)
    admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "1", "kind": "free"})
    copy = admin_client.post(f"/api/quizzes/{qid}/copy").json()["quiz"]
    assert copy["title"] == "Пятничный (копия)" and copy["id"] != qid and len(copy["rounds"]) == 1


def test_locked_quiz_rejects_edits(admin_client, client):
    qid = make_quiz(admin_client)
    client.app.state.locked_quiz_id = lambda: qid
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"title": "x"}).status_code == 409
    assert admin_client.get(f"/api/quizzes/{qid}").json()["locked"] is True


def test_next_cell_value():
    assert next_cell_value([100, 300], [100, 200, 300]) == 200
    assert next_cell_value([100, 200, 300], [100, 200, 300]) == 400
    assert next_cell_value([500], [500]) == 1000
    assert next_cell_value([], [100, 200]) == 100


def _jeopardy(c, **extra):
    qid = make_quiz(c)
    body = {"title": "Своя", "kind": "jeopardy", **extra}
    return qid, c.post(f"/api/quizzes/{qid}/rounds", json=body)


def test_create_jeopardy_round_with_values_and_themes(admin_client):
    _, r = _jeopardy(admin_client, cell_values=[300, 100, 200, 100], categories=["Кино", " ", "Музыка"])
    rnd = r.json()["quiz"]["rounds"][0]
    assert rnd["cell_values"] == [100, 200, 300]
    assert [c["name"] for c in rnd["categories"]] == ["Кино", "Музыка"]
    assert [q["value"] for q in rnd["categories"][1]["questions"]] == [100, 200, 300]


def test_create_round_default_values(admin_client):
    _, r = _jeopardy(admin_client)
    assert r.json()["quiz"]["rounds"][0]["cell_values"] == [100, 200, 300, 400, 500]


def test_create_category_fills_all_values_and_plus_adds_next(admin_client):
    _, r = _jeopardy(admin_client)
    rid = r.json()["quiz"]["rounds"][0]["id"]
    p = admin_client.post(f"/api/rounds/{rid}/categories", json={"name": "Кино"}).json()
    cat = p["quiz"]["rounds"][0]["categories"][0]
    assert [q["value"] for q in cat["questions"]] == [100, 200, 300, 400, 500]
    q200 = cat["questions"][1]["id"]
    admin_client.delete(f"/api/questions/{q200}")
    p = admin_client.post(f"/api/rounds/{rid}/questions", json={"category_id": cat["id"]}).json()
    vals = [q["value"] for q in p["quiz"]["rounds"][0]["categories"][0]["questions"]]
    assert vals == [100, 200, 300, 400, 500]
    p = admin_client.post(f"/api/rounds/{rid}/questions", json={"category_id": cat["id"]}).json()
    vals = [q["value"] for q in p["quiz"]["rounds"][0]["categories"][0]["questions"]]
    assert vals == [100, 200, 300, 400, 500, 600]


def test_update_cell_values_validation(admin_client):
    _, r = _jeopardy(admin_client, categories=["Кино"])
    rid = r.json()["quiz"]["rounds"][0]["id"]
    assert admin_client.patch(f"/api/rounds/{rid}", json={"cell_values": []}).status_code == 422
    assert admin_client.patch(f"/api/rounds/{rid}", json={"cell_values": list(range(1, 22))}).status_code == 422
    rnd = admin_client.patch(f"/api/rounds/{rid}", json={"cell_values": [200, 100, 200]}).json()["quiz"]["rounds"][0]
    assert rnd["cell_values"] == [100, 200]
    assert [q["value"] for q in rnd["categories"][0]["questions"]] == [100, 200, 300, 400, 500]


def test_categories_rejected_for_free_round(admin_client):
    qid = make_quiz(admin_client)
    r = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"kind": "free", "categories": ["Кино"]})
    assert r.status_code == 422


def test_copy_quiz_keeps_cell_values(admin_client):
    qid, _ = _jeopardy(admin_client, cell_values=[10, 20])
    copy = admin_client.post(f"/api/quizzes/{qid}/copy").json()["quiz"]
    assert copy["rounds"][0]["cell_values"] == [10, 20]


def test_old_db_without_cell_values_column_migrates(tmp_path):
    engine = make_engine(tmp_path)
    con = sqlite3.connect(tmp_path / "tquiz.db")
    con.execute(
        "CREATE TABLE round (id INTEGER PRIMARY KEY, quiz_id INTEGER NOT NULL, position INTEGER NOT NULL,"
        " title VARCHAR NOT NULL, kind VARCHAR NOT NULL, minus_on_wrong BOOLEAN NOT NULL,"
        " buzzer_mode VARCHAR NOT NULL, bar_seconds INTEGER NOT NULL, discuss_seconds INTEGER NOT NULL,"
        " input_seconds INTEGER NOT NULL, stakes BOOLEAN NOT NULL)"
    )
    con.execute("INSERT INTO round VALUES (1, 1, 0, 'Старый', 'jeopardy', 0, 'bar', 5, 60, 15, 0)")
    con.commit()
    con.close()
    init_db(engine)
    con = sqlite3.connect(tmp_path / "tquiz.db")
    cols = [r[1] for r in con.execute("PRAGMA table_info(round)")]
    assert "cell_values" in cols
    assert con.execute("SELECT cell_values FROM round").fetchone()[0] == "[100, 200, 300, 400, 500]"
    con.close()


CREAM = {"bg": "#FBF5EA", "text": "#2B2420", "accent": "#E2552F", "second": "#2F7FA8"}
NIGHT = {"bg": "#16192B", "text": "#F3F1EA", "accent": "#FF8A5B", "second": "#5CC8C2"}
IMG, MP3 = "a" * 32 + ".png", "b" * 32 + ".mp3"


def test_new_quiz_has_cream_theme_and_no_media(admin_client):
    quiz = admin_client.post("/api/quizzes", json={"title": "Q"}).json()["quiz"]
    assert quiz["theme"] == CREAM and quiz["background"] is None and quiz["lobby_music"] is None


def test_patch_quiz_theme_background_and_lobby_music(admin_client):
    qid = make_quiz(admin_client)
    p = admin_client.patch(
        f"/api/quizzes/{qid}", json={"theme": NIGHT, "background_filename": IMG, "lobby_music_filename": MP3}
    )
    quiz = p.json()["quiz"]
    assert quiz["theme"] == NIGHT and quiz["background"]["url"] == f"/media/{IMG}" and quiz["lobby_music"]["kind"] == "audio"
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"theme": {**NIGHT, "bg": "red"}}).status_code == 422
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"background_filename": MP3}).status_code == 422
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"lobby_music_filename": IMG}).status_code == 422
    quiz = admin_client.patch(f"/api/quizzes/{qid}", json={"background_filename": None}).json()["quiz"]
    assert quiz["background"] is None and quiz["theme"] == NIGHT


def test_patch_round_appearance_and_typewriter(admin_client):
    qid = make_quiz(admin_client)
    rnd = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "Т", "kind": "jeopardy"}).json()["quiz"]["rounds"][0]
    assert (rnd["typewriter"], rnd["type_speed"], rnd["background"], rnd["intro_music"]) == (False, 15, None, None)
    body = {"background_filename": IMG, "intro_music_filename": MP3, "think_music_filename": MP3, "typewriter": True, "type_speed": 20}
    rnd = admin_client.patch(f"/api/rounds/{rnd['id']}", json=body).json()["quiz"]["rounds"][0]
    assert rnd["background"]["kind"] == "image" and rnd["intro_music"]["kind"] == "audio" and rnd["think_music"]
    assert (rnd["typewriter"], rnd["type_speed"]) == (True, 20)
    assert admin_client.patch(f"/api/rounds/{rnd['id']}", json={"intro_music_filename": IMG}).status_code == 422
    assert admin_client.patch(f"/api/rounds/{rnd['id']}", json={"background_filename": MP3}).status_code == 422
    assert admin_client.patch(f"/api/rounds/{rnd['id']}", json={"type_speed": 0}).status_code == 422
    rnd = admin_client.patch(f"/api/rounds/{rnd['id']}", json={"intro_music_filename": None}).json()["quiz"]["rounds"][0]
    assert rnd["intro_music"] is None and rnd["background"] is not None


def test_copy_quiz_copies_appearance(admin_client):
    qid = make_quiz(admin_client)
    admin_client.patch(
        f"/api/quizzes/{qid}", json={"theme": NIGHT, "background_filename": IMG, "lobby_music_filename": MP3}
    )
    rnd = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "Т", "kind": "free"}).json()["quiz"]["rounds"][0]
    admin_client.patch(f"/api/rounds/{rnd['id']}", json={"background_filename": IMG, "typewriter": True})
    copy = admin_client.post(f"/api/quizzes/{qid}/copy").json()["quiz"]
    assert copy["id"] != qid and copy["theme"] == NIGHT
    assert copy["background"]["filename"] == IMG and copy["lobby_music"]["filename"] == MP3
    assert copy["rounds"][0]["background"]["filename"] == IMG and copy["rounds"][0]["typewriter"] is True


def test_old_db_gets_appearance_columns(tmp_path):
    engine = make_engine(tmp_path)
    con = sqlite3.connect(tmp_path / "tquiz.db")
    con.execute("CREATE TABLE quiz (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, logo_filename VARCHAR)")
    con.execute("INSERT INTO quiz VALUES (1, 'Старый', NULL)")
    con.execute(
        "CREATE TABLE round (id INTEGER PRIMARY KEY, quiz_id INTEGER NOT NULL, position INTEGER NOT NULL,"
        " title VARCHAR NOT NULL, kind VARCHAR NOT NULL, minus_on_wrong BOOLEAN NOT NULL,"
        " buzzer_mode VARCHAR NOT NULL, bar_seconds INTEGER NOT NULL, discuss_seconds INTEGER NOT NULL,"
        " input_seconds INTEGER NOT NULL, stakes BOOLEAN NOT NULL, cell_values JSON NOT NULL)"
    )
    con.execute("INSERT INTO round VALUES (1, 1, 0, 'Старый', 'jeopardy', 0, 'bar', 5, 60, 15, 0, '[100]')")
    con.commit()
    con.close()
    init_db(engine)
    con = sqlite3.connect(tmp_path / "tquiz.db")
    qcols = [r[1] for r in con.execute("PRAGMA table_info(quiz)")]
    rcols = [r[1] for r in con.execute("PRAGMA table_info(round)")]
    for c in ("theme", "background_filename", "lobby_music_filename"):
        assert c in qcols
    for c in ("background_filename", "intro_music_filename", "think_music_filename", "typewriter", "type_speed"):
        assert c in rcols
    assert json.loads(con.execute("SELECT theme FROM quiz").fetchone()[0]) == CREAM
    assert con.execute("SELECT typewriter, type_speed FROM round").fetchone() == (0, 15)
    con.close()
