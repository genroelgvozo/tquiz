import pytest

from app.game import freeinput
from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.text import normalize_answer
from app.quizdata import media_ref
from tests.factories import FakeClock, free_round, make_quiz, new_game, q, round_score


def setup(stakes=False, questions=None):
    clock = FakeClock()
    qs = questions or [q(1, answer="Грачи прилетели"), q(2, answer="Брат", options=["А", "Б", "В"], correct_option=1)]
    g = new_game(make_quiz([free_round(10, qs, stakes=stakes)]), clock=clock)
    a, b, c = (g.join(n).team_id for n in ("А", "Б", "В"))
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    return g, clock, a, b, c


def test_normalize_answer():
    assert normalize_answer("  «Грачи  прилетели»!  Ёж ") == "грачи прилетели еж"


def test_answer_allowed_before_timer_start_and_last_wins():
    g, clock, a, *_ = setup()
    g.apply_team(a, SubmitAnswer(text="раз"))
    g.apply_team(a, SubmitAnswer(text="два"))
    assert g.state.free.answers["1"][a].text == "два"


def test_timer_two_phase_defaults_pause_add_finish():
    g, clock, a, *_ = setup()
    g.apply_admin(TimerStart())
    t = g.state.free.timer
    assert (t.total_seconds, t.input_seconds, t.deadline) == (75, 15, 1075.0)
    clock.advance(10)
    g.apply_admin(TimerPause())
    assert g.state.free.timer.remaining == 65
    clock.advance(100)
    g.apply_admin(TimerResume())
    g.apply_admin(TimerAdd())
    assert g.state.free.timer.deadline == clock() + 75
    clock.advance(75)
    assert g.tick() is True and g.state.free.timer.status == "finished"


def test_question_seconds_override():
    g, *_ = setup(questions=[q(1, discuss_seconds=30, input_seconds=10)])
    assert g.state.free.timer.total_seconds == 40


def test_answer_accepted_within_grace_after_deadline():
    g, clock, a, *_ = setup()
    g.apply_admin(TimerStart())
    clock.advance(75.5)
    g.apply_team(a, SubmitAnswer(text="успели"))
    assert g.state.free.answers["1"][a].text == "успели" and g.state.free.timer.status == "finished"


def test_answer_rejected_after_grace():
    g, clock, a, *_ = setup()
    g.apply_admin(TimerStart())
    clock.advance(76.5)
    with pytest.raises(GameError, match="закрыт"):
        g.apply_team(a, SubmitAnswer(text="поздно"))


def test_manual_finish_grace_counts_from_finish():
    g, clock, a, *_ = setup()
    g.apply_admin(TimerStart())
    clock.advance(10)
    g.apply_admin(TimerFinish())
    clock.advance(0.5)
    g.apply_team(a, SubmitAnswer(text="ок"))
    clock.advance(1.0)
    with pytest.raises(GameError):
        g.apply_team(a, SubmitAnswer(text="поздно"))


def test_option_answer_validation():
    g, clock, a, *_ = setup()
    g.apply_admin(OpenQuestion(index=1))
    with pytest.raises(GameError):
        g.apply_team(a, SubmitAnswer(option=5))
    g.apply_team(a, SubmitAnswer(option=1))
    assert g.state.free.answers["2"][a].option == 1


def test_stake_ignored_when_round_has_no_stakes():
    g, clock, a, *_ = setup(stakes=False)
    g.apply_team(a, SubmitAnswer(text="x", stake=True))
    assert g.state.free.answers["1"][a].stake is False


def test_review_premarks_without_points():
    g, clock, a, b, c = setup(stakes=True)
    g.apply_team(a, SubmitAnswer(text="грачи прилетели!"))
    g.apply_team(b, SubmitAnswer(text="Саврасов", stake=True))
    g.apply_admin(OpenQuestion(index=1))
    g.apply_team(a, SubmitAnswer(option=1, stake=True))
    g.apply_team(b, SubmitAnswer(option=0))
    g.apply_admin(StartReview())
    assert g.state.free.marks["1"] == {a: True, b: None, c: False}
    assert g.team(a).round_scores == {}
    g.apply_admin(Mark(question_id=1, team_id=b, correct=False))
    assert g.state.free.marks["1"][b] is False
    g.apply_admin(ReviewGoto(index=1))
    assert g.state.free.marks["2"] == {a: True, b: False, c: False}
    assert all(g.team(t).round_scores == {} for t in (a, b, c))


def test_round_points_count_stakes_and_marks():
    g, clock, a, b, c = setup(stakes=True)
    g.apply_team(a, SubmitAnswer(text="грачи прилетели!"))
    g.apply_team(b, SubmitAnswer(text="Саврасов", stake=True))
    g.apply_admin(OpenQuestion(index=1))
    g.apply_team(a, SubmitAnswer(option=1, stake=True))
    g.apply_admin(StartReview())
    g.apply_admin(ReviewGoto(index=1))
    g.apply_admin(Mark(question_id=1, team_id=b, correct=False))
    assert freeinput.round_points(g) == {a: 3, b: -1, c: 0}
    assert round_score(g, a) == 3


def test_stake_without_answer_is_wrong():
    g, clock, a, *_ = setup(stakes=True)
    g.apply_team(a, SubmitAnswer(text="", stake=True))
    g.apply_admin(StartReview())
    assert g.state.free.marks["1"][a] is False and freeinput.round_points(g)[a] == -1


def test_changing_mark_changes_round_points_and_revisit_does_not_double():
    g, clock, a, *_ = setup()
    g.apply_team(a, SubmitAnswer(text="Грачи прилетели"))
    g.apply_admin(StartReview())
    g.apply_admin(ReviewGoto(index=1))
    g.apply_admin(ReviewGoto(index=0))
    assert freeinput.round_points(g)[a] == 1
    g.apply_admin(Mark(question_id=1, team_id=a, correct=False))
    assert freeinput.round_points(g)[a] == 0


def test_mark_requires_reviewed_question():
    g, clock, a, *_ = setup()
    g.apply_admin(StartReview())
    with pytest.raises(GameError):
        g.apply_admin(Mark(question_id=2, team_id=a, correct=True))


def test_open_question_with_audio_plays_it():
    g, *_ = setup(questions=[q(1, media=media_ref("a" * 32 + ".mp3", "audio"))])
    assert g.state.audio.action == "play"
