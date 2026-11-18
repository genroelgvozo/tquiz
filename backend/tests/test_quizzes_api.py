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
    admin_client.post(f"/api/rounds/{rnd['id']}/questions", json={"category_id": cat["id"]})
    p = admin_client.post(f"/api/rounds/{rnd['id']}/questions", json={"category_id": cat["id"]}).json()
    assert [q["value"] for q in p["quiz"]["rounds"][0]["categories"][0]["questions"]] == [100, 200]


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
