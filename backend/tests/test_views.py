from app.game import scoring
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
        ("team", a, SubmitAnswer(text="ответ команды А", stake=True)),
        Mark(question_id=3, team_id=a, correct=True, text="ответ команды А"), TimerStart(),
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
            assert "marks" not in s
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


def _jeopardy_game():
    g = new_game(
        make_quiz(
            [
                jeopardy_round(1, [("К", [q(1, value=100)])], buzzer_mode="instant"),
                free_round(2, [q(2, answer="Да")]),
            ]
        )
    )
    a = g.join("А").team_id
    b = g.join("Б").team_id
    return g, a, b


def test_team_score_by_stage():
    from app.game.views import TeamScore

    g, a, b = _jeopardy_game()
    assert team_view(g, a).score is None
    g.apply_admin(StartGame())
    assert team_view(g, a).score == TeamScore(kind="total", value=0)
    g.apply_admin(StartRound())
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    assert team_view(g, a).score == TeamScore(kind="round", value=100)
    g.apply_admin(NextRound())
    assert team_view(g, a).score == TeamScore(kind="total", value=100)
    g.apply_admin(StartRound())
    assert team_view(g, a).score is None
    g.apply_team(a, SubmitAnswer(text="да"))
    g.apply_admin(StartReview())
    assert team_view(g, a).score is None
    g.apply_admin(FinishGame())
    assert team_view(g, a).score == TeamScore(kind="total", value=101)


def test_open_round_points_never_reach_screen_or_team():
    seen = 0
    for g, _ in scripted_states():
        if g.state.stage != "free":
            continue
        seen += 1
        s = screen_view(g, "u")
        assert s.jeopardy is None
        assert all(c.closed is (c.index in g.state.closed_rounds) for c in s.standings.columns)
        assert all(r.rounds[1] is None for r in s.standings.rows)
        assert all(r.total == scoring.total(g, g.team(r.team_id)) for r in s.standings.rows)
        assert all(r.total == sum(x for x in r.rounds if x is not None) for r in s.standings.rows)
        for t in g.state.teams:
            assert team_view(g, t.id).score is None
    assert seen


def test_standings_columns_and_rows():
    g, a, b = _jeopardy_game()
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    g.apply_admin(NextRound())
    st = screen_view(g, "u").standings
    assert [c.closed for c in st.columns] == [True, False]
    assert [r.team_id for r in st.rows] == [b, a]
    assert st.rows[0].rounds == [100, None] and st.rows[0].total == 100


def test_screen_jeopardy_has_round_scores():
    g, a, b = _jeopardy_game()
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    assert screen_view(g, "u").jeopardy.scores == {a: 100, b: 0}


def test_admin_view_teams_have_round_and_total_and_adjust_target():
    g, a, b = _jeopardy_game()
    assert admin_view(g, "u", set()).state.score_adjust_round is None
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    st = admin_view(g, "u", set()).state
    assert st.score_adjust_round == 0
    assert all(t.round_score is not None and t.total == 0 for t in st.teams)
