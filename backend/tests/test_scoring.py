import pytest

from app.game import scoring
from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.state import GameState
from app.game.views import admin_view
from tests.factories import FakeClock, free_round, jeopardy_round, make_quiz, new_game, q, round_score, total


def quiz():
    return make_quiz(
        [
            jeopardy_round(
                1,
                [("Кино", [q(1, value=100), q(2, value=200)])],
                buzzer_mode="instant",
                minus_on_wrong=True,
            ),
            free_round(2, [q(3, answer="Да"), q(4, answer="Нет")], stakes=True),
            jeopardy_round(3, [("Музыка", [q(5, value=300)])], buzzer_mode="instant"),
        ]
    )


def setup():
    g = new_game(quiz(), clock=FakeClock())
    a = g.join("А").team_id
    b = g.join("Б").team_id
    return g, a, b


def in_round1(g):
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())


def play_round1(g, a, b):
    in_round1(g)
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    g.apply_admin(ToBoard())
    g.apply_admin(OpenCell(question_id=2))
    g.apply_team(b, BuzzCmd())
    g.apply_admin(Judge(correct=False))


def test_jeopardy_points_go_to_round_score_and_total_after_close():
    g, a, b = setup()
    play_round1(g, a, b)
    assert round_score(g, a) == 100 and round_score(g, b) == -200
    assert total(g, a) == 0 and total(g, b) == 0
    g.apply_admin(NextRound())
    assert g.state.closed_rounds == [0]
    assert total(g, a) == 100 and total(g, b) == -200


def test_next_round_shows_standings_overlay_only_after_a_closed_round():
    g, a, b = setup()
    g.apply_admin(StartGame())
    assert g.state.overlay is None
    g.apply_admin(StartRound())
    g.apply_admin(NextRound())
    assert g.state.overlay == "leaderboard"
    g.apply_admin(StartRound())
    assert g.state.overlay is None


def test_skipped_round_is_not_closed():
    g, a, b = setup()
    g.apply_admin(StartGame())
    g.apply_admin(NextRound())
    assert g.state.closed_rounds == [] and g.state.overlay is None


def test_finish_game_closes_current_round():
    g, a, b = setup()
    in_round1(g)
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    g.apply_admin(FinishGame())
    assert g.state.closed_rounds == [0] and total(g, a) == 100


def go_to_free(g):
    in_round1(g)
    g.apply_admin(NextRound())
    g.apply_admin(StartRound())


def test_free_round_points_from_marks_at_close():
    g, a, b = setup()
    go_to_free(g)
    g.apply_team(a, SubmitAnswer(text="да"))
    g.apply_team(b, SubmitAnswer(text="котик", stake=True))
    g.apply_admin(StartReview())
    assert round_score(g, a) == 1 and total(g, a) == 0
    before_a, before_b = total(g, a), total(g, b)
    g.apply_admin(NextRound())
    assert total(g, a) - before_a == 1 and total(g, b) - before_b == 0


def test_free_round_empty_stake_is_minus_and_silent_team_zero():
    g, a, b = setup()
    go_to_free(g)
    g.apply_team(b, SubmitAnswer(text="", stake=True))
    g.apply_admin(StartReview())
    g.apply_admin(NextRound())
    assert total(g, b) == -1 and total(g, a) == 0


def test_adjust_score_targets():
    g, a, b = setup()
    with pytest.raises(GameError):
        g.apply_admin(AdjustScore(team_id=a, delta=5))
    g.apply_admin(StartGame())
    with pytest.raises(GameError):
        g.apply_admin(AdjustScore(team_id=a, delta=5))
    g.apply_admin(StartRound())
    g.apply_admin(AdjustScore(team_id=a, delta=5))
    assert round_score(g, a) == 5
    g.apply_admin(NextRound())
    g.apply_admin(AdjustScore(team_id=a, delta=3))
    assert scoring.stored_round_score(g.team(a), 0) == 8 and total(g, a) == 8
    g.apply_admin(FinishGame())
    g.apply_admin(AdjustScore(team_id=a, delta=1))
    assert scoring.stored_round_score(g.team(a), 0) == 9


def test_undo_adjust_returns_to_same_round():
    g, a, b = setup()
    in_round1(g)
    g.apply_admin(AdjustScore(team_id=a, delta=5))
    g.apply_admin(NextRound())
    g.apply_admin(AdjustScore(team_id=a, delta=3))
    assert scoring.stored_round_score(g.team(a), 0) == 8
    g.apply_admin(Undo())
    assert scoring.stored_round_score(g.team(a), 0) == 5 and total(g, a) == 5


def test_undo_judge_restores_round_score_after_manual_adjust():
    g, a, b = setup()
    in_round1(g)
    g.apply_admin(AdjustScore(team_id=a, delta=7))
    g.apply_admin(OpenCell(question_id=1))
    g.apply_team(a, BuzzCmd())
    g.apply_admin(Judge(correct=True))
    assert round_score(g, a) == 107
    g.apply_admin(Undo())
    assert round_score(g, a) == 7


def test_late_team_has_zero_for_closed_rounds():
    g, a, b = setup()
    play_round1(g, a, b)
    g.apply_admin(NextRound())
    late = g.join("В").team_id
    standings = admin_view(g, "u", set()).state.standings
    row = next(r for r in standings.rows if r.team_id == late)
    assert row.rounds[0] == 0 and row.total == 0


def test_deleted_team_not_in_standings():
    g, a, b = setup()
    play_round1(g, a, b)
    g.apply_admin(DeleteTeam(team_id=a))
    g.apply_admin(NextRound())
    standings = admin_view(g, "u", set()).state.standings
    assert [r.team_id for r in standings.rows] == [b]


def test_finish_from_lobby_has_empty_standings():
    g, a, b = setup()
    g.apply_admin(FinishGame())
    standings = admin_view(g, "u", set()).state.standings
    assert g.state.closed_rounds == []
    assert all(r.rounds == [None, None, None] and r.total == 0 for r in standings.rows)


def test_old_state_json_with_score_loads():
    state = GameState.model_validate(
        {"quiz_id": 1, "teams": [{"id": "t", "name": "А", "token": "x", "score": 5, "joined_at": 1.0}]}
    )
    assert state.teams[0].round_scores == {}


def test_initial_chooser_lowest_total_then_earliest():
    clock = FakeClock()
    g = new_game(
        make_quiz([jeopardy_round(1, [("К", [q(1)])]), jeopardy_round(2, [("К", [q(2)])])]),
        clock=clock,
    )
    a = g.join("А").team_id
    clock.advance(1)
    b = g.join("Б").team_id
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    assert g.state.jeopardy.chooser_team_id == a
    g.apply_admin(AdjustScore(team_id=a, delta=50))
    g.apply_admin(NextRound())
    g.apply_admin(StartRound())
    assert g.state.jeopardy.chooser_team_id == b
