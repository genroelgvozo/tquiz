import pytest

from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.jeopardy import buzzer_status
from app.quizdata import media_ref
from tests.factories import FakeClock, jeopardy_round, make_quiz, new_game, q

AUDIO = media_ref("b" * 32 + ".mp3", "audio")


def setup(mode="instant", minus=True, teams=("А", "Б", "В")):
    clock = FakeClock()
    rnd = jeopardy_round(
        1,
        [("Кино", [q(1, value=100), q(2, value=200, is_secret=True)]), ("Музыка", [q(3, value=300, media=AUDIO)])],
        buzzer_mode=mode,
        bar_seconds=5,
        minus_on_wrong=minus,
    )
    g = new_game(make_quiz([rnd]), clock=clock)
    ids = [g.join(n).team_id for n in teams]
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    return g, clock, ids


def test_initial_chooser_lowest_score_then_earliest():
    clock = FakeClock()
    g = new_game(make_quiz([jeopardy_round(1, [("К", [q(1)])])]), clock=clock)
    a = g.join("А").team_id
    clock.advance(1)
    b = g.join("Б").team_id
    g.apply_admin(AdjustScore(team_id=a, delta=50))
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    assert g.state.jeopardy.chooser_team_id == b


def test_open_cell_instant_opens_buttons_and_marks_played():
    g, clock, _ = setup()
    g.apply_admin(OpenCell(question_id=1))
    j = g.state.jeopardy
    assert (j.phase, j.buttons, j.played) == ("question", "open", [1])
    g.apply_admin(ToBoard())
    with pytest.raises(GameError, match="сыгран"):
        g.apply_admin(OpenCell(question_id=1))


def test_bar_mode_opens_after_bar_seconds():
    g, clock, _ = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    clock.advance(4.5)
    assert g.tick() is False and g.state.jeopardy.buttons == "bar"
    clock.advance(0.5)
    assert g.tick() is True and g.state.jeopardy.buttons == "open"


def test_false_start_locks_for_one_second():
    g, clock, (a, b, c) = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    clock.advance(4.5)
    g.apply_team(a, BuzzCmd())
    clock.advance(0.6)
    g.apply_team(a, BuzzCmd())
    assert g.state.jeopardy.answering_team_id is None
    clock.advance(0.5)
    g.apply_team(a, BuzzCmd())
    assert g.state.jeopardy.answering_team_id == a


def test_first_buzz_wins_second_recorded():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    clock.advance(0.41)
    g.apply_team(a, BuzzCmd())
    j = g.state.jeopardy
    assert j.answering_team_id == b and j.buttons == "locked"
    assert [(x.team_id, round(x.at - j.buzzes[0].at, 2)) for x in j.buzzes] == [(b, 0), (a, 0.41)]


def test_correct_adds_value_reveals_and_passes_choice():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    j = g.state.jeopardy
    assert g.team(b).score == 100 and j.phase == "answer" and j.chooser_team_id == b


def test_wrong_with_minus_excludes_and_reopens():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    j = g.state.jeopardy
    assert g.team(b).score == -100 and j.excluded == [b] and j.buttons == "open" and j.buzzes == []
    g.apply_team(b, BuzzCmd())
    assert g.state.jeopardy.answering_team_id is None


def test_wrong_without_minus_keeps_score():
    g, clock, (a, b, c) = setup(minus=False)
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    assert g.team(b).score == 0


def test_all_wrong_keeps_previous_chooser():
    g, clock, (a, b, c) = setup()
    chooser = g.state.jeopardy.chooser_team_id
    g.apply_admin(OpenCell(question_id=1))
    for t in (a, b, c):
        g.apply_team(t, BuzzCmd())
        g.apply_admin(Judge(correct=False))
    j = g.state.jeopardy
    assert j.phase == "answer" and j.chooser_team_id == chooser


def test_secret_rules():
    g, clock, (a, b, c) = setup()
    g.apply_admin(SetChooser(team_id=a))
    g.apply_admin(OpenCell(question_id=2))
    assert g.state.jeopardy.phase == "secret"
    with pytest.raises(GameError, match="другой"):
        g.apply_admin(SetSecretRecipient(team_id=a))
    g.apply_admin(SetSecretRecipient(team_id=b))
    g.apply_team(c, BuzzCmd())
    assert g.state.jeopardy.answering_team_id == b
    g.apply_admin(Judge(correct=False))
    j = g.state.jeopardy
    assert g.team(b).score == -200 and j.phase == "answer" and j.chooser_team_id == a


def test_secret_correct_recipient_chooses_next():
    g, clock, (a, b, c) = setup()
    g.apply_admin(SetChooser(team_id=a))
    g.apply_admin(OpenCell(question_id=2))
    g.apply_admin(SetSecretRecipient(team_id=b))
    g.apply_admin(Judge(correct=True))
    assert g.state.jeopardy.chooser_team_id == b and g.team(b).score == 200


def test_buzz_on_audio_question_pauses_audio():
    g, clock, (a, *_) = setup()
    g.apply_admin(OpenCell(question_id=3))
    assert g.state.audio.action == "play"
    g.apply_team(a, BuzzCmd())
    assert g.state.audio.action == "pause"


def test_undo_wrong_answer_restores_buttons_and_score():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    g.apply_team(c, BuzzCmd())
    g.apply_admin(Undo())
    j = g.state.jeopardy
    assert g.team(b).score == 0 and j.answering_team_id == b and j.excluded == [] and j.buttons == "locked"


def test_delete_answering_team_reopens_buttons():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(DeleteTeam(team_id=b))
    j = g.state.jeopardy
    assert j.answering_team_id is None and j.buttons == "open"


def test_delete_chooser_clears_chooser():
    g, clock, (a, b, c) = setup()
    g.apply_admin(SetChooser(team_id=c))
    g.apply_admin(DeleteTeam(team_id=c))
    assert g.state.jeopardy.chooser_team_id is None


def test_reveal_then_board_stops_audio():
    g, clock, _ = setup()
    g.apply_admin(OpenCell(question_id=3))
    g.apply_admin(Reveal())
    assert g.state.jeopardy.phase == "answer"
    g.apply_admin(ToBoard())
    assert g.state.jeopardy.phase == "board" and g.state.audio.action == "stop"


def test_buzzer_status_mapping():
    g, clock, (a, b, c) = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    assert buzzer_status(g, a) == "bar"
    g.apply_team(a, BuzzCmd())
    assert buzzer_status(g, a) == "locked_out"
    clock.advance(5)
    g.tick()
    g.apply_team(b, BuzzCmd())
    assert (buzzer_status(g, b), buzzer_status(g, c)) == ("answering_me", "answering_other")
    g.apply_admin(Judge(correct=False))
    assert buzzer_status(g, b) == "excluded"
