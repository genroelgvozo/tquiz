from app.game import scoring
from app.game.commands import *  # noqa: F403
from app.game.constants import REVEAL_SECONDS
from app.game.views import TypingView, admin_view, screen_view, team_view
from app.quizdata import Theme, media_ref
from tests.factories import FakeClock, free_round, jeopardy_round, make_quiz, new_game, q, reveal

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
        StartGame(), StartRound(), OpenCell(question_id=1), ("wait", REVEAL_SECONDS), ("team", a, BuzzCmd()),
        Judge(correct=False), ("team", b, BuzzCmd()), Judge(correct=True), ToBoard(), OpenCell(question_id=2),
        SetSecretRecipient(team_id=a), Judge(correct=True), NextRound(), StartRound(),
        ("team", a, SubmitAnswer(text="ответ команды А", stake=True)),
        Mark(question_id=3, team_id=a, correct=True, text="ответ команды А"), TimerStart(),
        OpenQuestion(index=1), ("team", b, SubmitAnswer(option=1)), StartReview(), ReviewShowAnswer(), ReviewGoto(index=1),
        ReviewShowAnswer(), FinishGame(),
    ]
    yield g, None
    for s in steps:
        if isinstance(s, tuple) and s[0] == "wait":
            clock.advance(s[1])
            g.tick()
        elif isinstance(s, tuple):
            g.apply_team(s[1], s[2])
        else:
            g.apply_admin(s)
        yield g, s


def test_undo_label_only_in_admin_view():
    for g, _ in scripted_states():
        assert "undo_label" not in screen_view(g, "u").model_dump_json()
        for t in g.state.teams:
            assert "undo_label" not in team_view(g, t.id).model_dump_json()


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
        revealed = (s.jeopardy and s.jeopardy.phase == "answer") or (
            s.free and s.free.phase == "review" and g.state.free.answer_shown
        )
        dumped = s.model_dump_json()
        assert (SECRET_ANS in dumped) == bool(revealed), step
        assert "correct_option" not in dumped and "ответ команды А" not in dumped
        assert '"marks"' not in dumped


def test_review_highlight_option_only_after_show():
    for g, step in scripted_states():
        if isinstance(step, ReviewGoto):
            q_ = screen_view(g, "u").free.question
            assert q_.highlight_option is None and q_.answer is None
        if isinstance(step, ReviewShowAnswer) and g.state.free.review_index == 1:
            q_ = screen_view(g, "u").free.question
            assert q_.highlight_option == 1 and q_.answer == SECRET_ANS


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
    reveal(g, g.clock)
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
    reveal(g, g.clock)
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
    reveal(g, g.clock)
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
    reveal(g, g.clock)
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


def test_screen_typing_view_only_for_live_typewriter_question():
    def start(typewriter):
        rnd = jeopardy_round(
            1,
            [("К", [q(1), q(2, is_secret=True), q(3)])],
            buzzer_mode="instant",
            typewriter=typewriter,
            type_speed=12,
        )
        g = new_game(make_quiz([rnd]))
        a, b = g.join("А").team_id, g.join("Б").team_id
        g.apply_admin(StartGame())
        g.apply_admin(StartRound())
        g.apply_admin(SetChooser(team_id=a))
        return g, a, b

    g, a, b = start(typewriter=True)
    g.apply_admin(OpenCell(question_id=1))
    assert screen_view(g, "u").jeopardy.typing == TypingView(base=0, since=None, speed=12)
    reveal(g, g.clock)
    s = screen_view(g, "u").jeopardy
    assert s.question_id == 1 and s.typing == TypingView(base=0, since=g.clock.t, speed=12)
    g.clock.advance(1)
    g.apply_team(b, BuzzCmd())
    assert screen_view(g, "u").jeopardy.typing == TypingView(base=12, since=None, speed=12)
    g.apply_admin(Reveal())
    s = screen_view(g, "u").jeopardy
    assert (s.phase, s.question_id, s.typing) == ("answer", 1, None)
    g.apply_admin(OpenCell(question_id=3))
    assert screen_view(g, "u").jeopardy.typing == TypingView(base=0, since=None, speed=12)
    g.apply_admin(ToBoard())
    assert screen_view(g, "u").jeopardy.question_id is None
    g.apply_admin(OpenCell(question_id=2))
    assert screen_view(g, "u").jeopardy.typing is None
    g.apply_admin(SetSecretRecipient(team_id=b))
    s = screen_view(g, "u").jeopardy
    assert (s.phase, s.question_id, s.typing) == ("question", 2, None)

    g, a, b = start(typewriter=False)
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, g.clock)
    assert screen_view(g, "u").jeopardy.typing is None


NIGHT = Theme(bg="#101020", text="#EEEEEE", accent="#FFAA00", second="#3366FF")
QBG = media_ref("1" * 32 + ".png", "image")
QMUSIC = media_ref("2" * 32 + ".mp3", "audio")
R1BG = media_ref("3" * 32 + ".png", "image")
R1INTRO = media_ref("4" * 32 + ".mp3", "audio")
R2BG = media_ref("5" * 32 + ".png", "image")
R2INTRO = media_ref("6" * 32 + ".mp3", "audio")


def appearance_game():
    r1 = jeopardy_round(1, [("Кино", [q(1)])], background=R1BG, intro_music=R1INTRO)
    r2 = free_round(2, [q(2)], background=R2BG, intro_music=R2INTRO)
    r2.background = None
    quiz = make_quiz([r1, r2], theme=NIGHT, background=QBG, lobby_music=QMUSIC)
    return new_game(quiz)


def test_theme_and_backgrounds_per_stage():
    g = appearance_game()
    g.join("А")
    v = screen_view(g, "u")
    assert v.theme == NIGHT and v.background_url == QBG.url and v.quiz_background_url == QBG.url
    g.apply_admin(StartGame())
    v = screen_view(g, "u")
    assert v.stage == "intro" and v.background_url == R1BG.url and v.quiz_background_url == QBG.url
    g.apply_admin(StartRound())
    v = screen_view(g, "u")
    assert v.stage == "jeopardy" and v.background_url == R1BG.url
    g.state.stage = "intro"
    g.state.round_index = 1
    v = screen_view(g, "u")
    assert v.background_url == QBG.url and v.quiz_background_url == QBG.url
    team = g.state.teams[0].id
    tv = team_view(g, team)
    assert tv.theme == NIGHT
    assert "/media/" not in tv.model_dump_json()


def test_preload_includes_appearance_media():
    g = appearance_game()
    pre = screen_view(g, "u").preload
    assert pre == [QBG.url, QMUSIC.url, R1BG.url, R1INTRO.url]
    assert R2INTRO.url not in pre
