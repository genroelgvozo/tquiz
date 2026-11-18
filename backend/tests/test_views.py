from app.game.commands import *  # noqa: F403
from app.game.views import admin_view, screen_view, team_view
from app.quizdata import media_ref
from tests.factories import FakeClock, free_round, jeopardy_round, make_quiz, new_game, q

SECRET_ANS = "СекретныйОтвет"
IMG = media_ref("c" * 32 + ".png", "image")


def scripted_states():
    """Plays a whole game and yields (game, last_step) after every step."""
    clock = FakeClock()
    quiz = make_quiz(
        [
            jeopardy_round(
                1,
                [("Кино", [q(1, answer=SECRET_ANS, media=IMG), q(2, answer=SECRET_ANS, is_secret=True)])],
                buzzer_mode="instant",
            ),
            free_round(
                2,
                [q(3, answer=SECRET_ANS, media=IMG), q(4, answer=SECRET_ANS, options=["x", "y"], correct_option=1)],
                stakes=True,
            ),
        ]
    )
    g = new_game(quiz, clock=clock)
    a = g.join("А").team_id
    b = g.join("Б").team_id
    steps = [
        StartGame(), StartRound(), OpenCell(question_id=1), ("team", a, BuzzCmd()), Judge(correct=False),
        ("team", b, BuzzCmd()), Judge(correct=True), ToBoard(), OpenCell(question_id=2),
        SetSecretRecipient(team_id=a), Judge(correct=True), NextRound(), StartRound(),
        ("team", a, SubmitAnswer(text="ответ команды А", stake=True)), TimerStart(),
        OpenQuestion(index=1), ("team", b, SubmitAnswer(option=1)), StartReview(), ReviewGoto(index=1), FinishGame(),
    ]
    yield g, None
    for s in steps:
        if isinstance(s, tuple):
            g.apply_team(s[1], s[2])
        else:
            g.apply_admin(s)
        yield g, s


def test_team_view_never_leaks():
    for g, _ in scripted_states():
        for t in g.state.teams:
            s = team_view(g, t.id).model_dump_json()
            assert SECRET_ANS not in s and "/media/" not in s and "correct_option" not in s and t.token not in s
            other = [x for x in g.state.teams if x.id != t.id][0]
            assert other.token not in s
    for g, _ in scripted_states():
        b = g.state.teams[1].id
        assert "ответ команды А" not in team_view(g, b).model_dump_json()


def test_screen_view_answer_only_when_revealed():
    for g, step in scripted_states():
        s = screen_view(g, "http://quiz.test/play")
        revealed = (s.jeopardy and s.jeopardy.phase == "answer") or (s.free and s.free.phase == "review")
        dumped = s.model_dump_json()
        assert (SECRET_ANS in dumped) == bool(revealed), step
        assert "correct_option" not in dumped and "ответ команды А" not in dumped


def test_screen_secret_hides_text_until_recipient():
    for g, step in scripted_states():
        if isinstance(step, OpenCell) and step.question_id == 2:
            assert screen_view(g, "u").jeopardy.question.text is None
        if isinstance(step, SetSecretRecipient):
            assert screen_view(g, "u").jeopardy.question.text == "Вопрос 2"


def test_screen_preload_lists_round_media():
    for g, step in scripted_states():
        if isinstance(step, StartRound) and g.state.round_index == 0:
            assert screen_view(g, "u").preload == [IMG.url]


def test_admin_view_has_answers_but_no_tokens():
    for g, _ in scripted_states():
        dumped = admin_view(g, "u", set()).model_dump_json()
        assert all(t.token not in dumped for t in g.state.teams) and "undo_stack" not in dumped
    assert SECRET_ANS in dumped


def test_team_free_view_shows_own_answer_and_options():
    for g, step in scripted_states():
        if isinstance(step, OpenQuestion):
            v = team_view(g, g.state.teams[1].id).free
            assert v.options == ["x", "y"] and v.number == 2 and v.total == 2 and v.stakes is True


def test_team_jeopardy_view_has_bar_seconds():
    g = new_game(make_quiz([jeopardy_round(1, [("К", [q(1)])], buzzer_mode="bar", bar_seconds=7)]))
    a = g.join("А").team_id
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(OpenCell(question_id=1))
    v = team_view(g, a).jeopardy
    assert v.buzzer == "bar" and v.bar_seconds == 7
