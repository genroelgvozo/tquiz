import pytest

from app.game.commands import *  # noqa: F403
from app.game.constants import REVEAL_SECONDS
from app.game.engine import GameError
from app.game.jeopardy import buzzer_status
from app.quizdata import media_ref
from tests.factories import FakeClock, jeopardy_round, make_quiz, new_game, q, reveal, round_score

AUDIO = media_ref("b" * 32 + ".mp3", "audio")


def setup(mode="instant", minus=True, teams=("А", "Б", "В"), typewriter=False, speed=15):
    clock = FakeClock()
    rnd = jeopardy_round(
        1,
        [("Кино", [q(1, value=100), q(2, value=200, is_secret=True)]), ("Музыка", [q(3, value=300, media=AUDIO)])],
        buzzer_mode=mode,
        bar_seconds=5,
        minus_on_wrong=minus,
        typewriter=typewriter,
        type_speed=speed,
    )
    g = new_game(make_quiz([rnd]), clock=clock)
    ids = [g.join(n).team_id for n in teams]
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    return g, clock, ids


def test_open_cell_instant_opens_buttons_and_marks_played():
    g, clock, _ = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    j = g.state.jeopardy
    assert (j.phase, j.buttons, j.played) == ("question", "open", [1])
    g.apply_admin(ToBoard())
    with pytest.raises(GameError, match="сыгран"):
        g.apply_admin(OpenCell(question_id=1))


def test_bar_mode_opens_after_bar_seconds():
    g, clock, _ = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    clock.advance(4.5)
    assert g.tick() is False and g.state.jeopardy.buttons == "bar"
    clock.advance(0.5)
    assert g.tick() is True and g.state.jeopardy.buttons == "open"


def test_false_start_locks_for_one_second():
    g, clock, (a, b, c) = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
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
    reveal(g, clock)
    g.apply_team(b, BuzzCmd())
    clock.advance(0.41)
    g.apply_team(a, BuzzCmd())
    j = g.state.jeopardy
    assert j.answering_team_id == b and j.buttons == "locked"
    assert [(x.team_id, round(x.at - j.buzzes[0].at, 2)) for x in j.buzzes] == [(b, 0), (a, 0.41)]


def test_correct_adds_value_reveals_and_passes_choice():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    j = g.state.jeopardy
    assert round_score(g, b) == 100 and j.phase == "answer" and j.chooser_team_id == b


def test_wrong_with_minus_excludes_and_reopens():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    j = g.state.jeopardy
    assert round_score(g, b) == -100 and j.excluded == [b] and j.buttons == "open" and j.buzzes == []
    g.apply_team(b, BuzzCmd())
    assert g.state.jeopardy.answering_team_id is None


def test_wrong_without_minus_keeps_score():
    g, clock, (a, b, c) = setup(minus=False)
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    assert round_score(g, b) == 0


def test_all_wrong_keeps_previous_chooser():
    g, clock, (a, b, c) = setup()
    chooser = g.state.jeopardy.chooser_team_id
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
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
    assert round_score(g, b) == -200 and j.phase == "answer" and j.chooser_team_id == a


def test_secret_correct_recipient_chooses_next():
    g, clock, (a, b, c) = setup()
    g.apply_admin(SetChooser(team_id=a))
    g.apply_admin(OpenCell(question_id=2))
    g.apply_admin(SetSecretRecipient(team_id=b))
    g.apply_admin(Judge(correct=True))
    assert g.state.jeopardy.chooser_team_id == b and round_score(g, b) == 200


def test_buzz_on_audio_question_pauses_audio():
    g, clock, (a, *_) = setup()
    g.apply_admin(OpenCell(question_id=3))
    reveal(g, clock)
    assert g.state.audio.action == "play"
    g.apply_team(a, BuzzCmd())
    assert g.state.audio.action == "pause"


def test_undo_wrong_answer_restores_buttons_and_score():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    g.apply_team(c, BuzzCmd())
    g.apply_admin(Undo())
    j = g.state.jeopardy
    assert round_score(g, b) == 0 and j.answering_team_id == b and j.excluded == [] and j.buttons == "locked"


def test_delete_answering_team_reopens_buttons():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
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
    reveal(g, clock)
    g.apply_admin(Reveal())
    assert g.state.jeopardy.phase == "answer"
    g.apply_admin(ToBoard())
    assert g.state.jeopardy.phase == "board" and g.state.audio.action == "stop"


def test_buzzer_status_mapping():
    g, clock, (a, b, c) = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    assert buzzer_status(g, a) == "bar"
    g.apply_team(a, BuzzCmd())
    assert buzzer_status(g, a) == "locked_out"
    clock.advance(5)
    g.tick()
    g.apply_team(b, BuzzCmd())
    assert (buzzer_status(g, b), buzzer_status(g, c)) == ("answering_me", "answering_other")
    g.apply_admin(Judge(correct=False))
    assert buzzer_status(g, b) == "excluded"


def test_buttons_closed_during_reveal_then_open_instant():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    j = g.state.jeopardy
    assert (j.buttons, j.starts_at) == ("closed", 1000 + REVEAL_SECONDS)
    g.apply_team(a, BuzzCmd())
    assert j.answering_team_id is None and g.state.jeopardy.lockouts == {}
    clock.advance(REVEAL_SECONDS)
    assert g.tick() is True and g.state.jeopardy.buttons == "open" and g.state.jeopardy.starts_at is None


def test_bar_starts_after_reveal():
    g, clock, (a, b, c) = setup(mode="bar")
    g.apply_admin(OpenCell(question_id=1))
    assert (g.state.jeopardy.buttons, g.state.jeopardy.bar_ends_at) == ("closed", None)
    g.apply_team(a, BuzzCmd())
    assert g.state.jeopardy.lockouts == {} and buzzer_status(g, a) == "closed"
    reveal(g, clock)
    j = g.state.jeopardy
    assert (j.buttons, j.bar_ends_at, j.starts_at) == ("bar", 1000 + REVEAL_SECONDS + 5, None)


@pytest.mark.parametrize("mode", ["instant", "bar"])
def test_open_buttons_during_reveal_starts_question_now(mode):
    g, clock, _ = setup(mode=mode, typewriter=True)
    g.apply_admin(OpenCell(question_id=1))
    clock.advance(0.5)
    g.apply_admin(OpenButtons())
    j = g.state.jeopardy
    assert (j.buttons, j.starts_at, j.bar_ends_at, j.typing_since) == ("open", None, None, clock.t)
    clock.advance(REVEAL_SECONDS)
    assert g.tick() is False


def test_question_audio_starts_after_reveal():
    g, clock, _ = setup()
    g.apply_admin(OpenCell(question_id=3))
    assert g.state.audio.action == "stop"
    reveal(g, clock)
    assert g.state.audio.action == "play"


def test_secret_audio_starts_on_recipient():
    g = new_game(make_quiz([jeopardy_round(1, [("К", [q(1, is_secret=True, media=AUDIO)])])]), clock=FakeClock())
    a, b = g.join("А").team_id, g.join("Б").team_id
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(SetChooser(team_id=a))
    g.apply_admin(OpenCell(question_id=1))
    assert (g.state.audio.action, g.state.jeopardy.starts_at) == ("stop", None)
    g.apply_admin(SetSecretRecipient(team_id=b))
    assert g.state.audio.action == "play"


def test_reveal_cancels_pending_start_and_stops_typing():
    g, clock, _ = setup(typewriter=True)
    g.apply_admin(OpenCell(question_id=3))
    g.apply_admin(Reveal())
    clock.advance(REVEAL_SECONDS)
    assert g.tick() is False
    j = g.state.jeopardy
    assert (j.phase, j.buttons, j.starts_at, g.state.audio.action) == ("answer", "closed", None, "stop")
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    assert g.state.jeopardy.typing_since == clock.t
    g.apply_admin(Reveal())
    assert g.state.jeopardy.typing_since is None


def test_typing_freezes_on_buzz_resumes_after_wrong_and_undo_refreezes():
    g, clock, (a, b, c) = setup(typewriter=True, speed=10)
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    j = g.state.jeopardy
    assert (j.typed_base, j.typing_since) == (0.0, 1000 + REVEAL_SECONDS)
    clock.advance(2)
    g.apply_team(a, BuzzCmd())
    assert (g.state.jeopardy.typed_base, g.state.jeopardy.typing_since) == (20.0, None)
    clock.advance(5)
    g.apply_admin(Judge(correct=False))
    assert g.state.jeopardy.typing_since == clock.t and g.state.jeopardy.typed_base == 20.0
    g.apply_admin(Undo())
    j = g.state.jeopardy
    assert (j.typing_since, j.typed_base, j.answering_team_id) == (None, 20.0, a)


def test_false_start_does_not_freeze_typing():
    g, clock, (a, *_) = setup(mode="bar", typewriter=True)
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    clock.advance(1)
    g.apply_team(a, BuzzCmd())
    j = g.state.jeopardy
    assert a in j.lockouts and (j.typed_base, j.typing_since) == (0.0, 1000 + REVEAL_SECONDS)


def test_typing_off_by_default():
    g, clock, (a, *_) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    assert g.state.jeopardy.typing_since is None
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    assert (g.state.jeopardy.buttons, g.state.jeopardy.typing_since) == ("open", None)
