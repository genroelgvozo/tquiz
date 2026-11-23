import pytest

from app.game import scoring
from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.views import admin_view
from tests.factories import FakeClock, jeopardy_round, make_quiz, new_game, q, reveal, round_score


def setup(minus=True):
    clock = FakeClock()
    rnd = jeopardy_round(
        1,
        [("Кино", [q(1, value=100), q(2, value=200, is_secret=True)]), ("Музыка", [q(3, value=300)])],
        buzzer_mode="instant",
        minus_on_wrong=minus,
    )
    g = new_game(make_quiz([rnd]), clock=clock)
    ids = [g.join(n).team_id for n in ("А", "Б", "В")]
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    return g, clock, ids


def label(g):
    return admin_view(g, "u", set()).undo_label


def test_empty_stack_has_no_label():
    g, _, _ = setup()
    assert label(g) is None


def test_open_cell_label():
    g, _, _ = setup()
    g.apply_admin(OpenCell(question_id=1))
    assert label(g) == "открыта Кино · 100"


def test_judge_labels_with_minus():
    g, clock, (a, b, _) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    assert label(g) == "✗ А −100"
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    assert label(g) == "✓ Б +100"


def test_judge_wrong_without_minus():
    g, clock, (a, _, _) = setup(minus=False)
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=False))
    assert label(g) == "✗ А"


def test_secret_recipient_label():
    g, _, (a, b, _) = setup()
    g.apply_admin(SetChooser(team_id=a))
    g.apply_admin(OpenCell(question_id=2))
    g.apply_admin(SetSecretRecipient(team_id=b))
    assert label(g) == "секрет → Б"


def test_adjust_score_labels():
    g, _, (a, _, _) = setup()
    g.apply_admin(AdjustScore(team_id=a, delta=50))
    assert label(g) == "правка А +50"
    g.apply_admin(AdjustScore(team_id=a, delta=-5))
    assert label(g) == "правка А −5"


def test_undo_shows_previous_label():
    g, clock, (a, _, _) = setup()
    g.apply_admin(OpenCell(question_id=1))
    reveal(g, clock)
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    g.apply_admin(Undo())
    assert label(g) == "открыта Кино · 100"


def test_old_entry_without_label_still_undoes():
    g, _, (a, _, _) = setup()
    scoring.add_points(g.team(a), 0, 3)
    g.state.undo_stack.append({"kind": "score", "team_id": a, "delta": 3, "round": 0})
    assert label(g) == ""
    g.apply_admin(Undo())
    assert label(g) is None and round_score(g, a) == 0


def test_judge_with_nobody_answering_still_raises_game_error():
    g, _, _ = setup()
    g.apply_admin(OpenCell(question_id=1))
    with pytest.raises(GameError, match="Никто не отвечает"):
        g.apply_admin(Judge(correct=True))
