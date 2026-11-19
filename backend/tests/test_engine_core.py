import pytest

from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game import scoring
from tests.factories import FakeClock, free_round, make_quiz, new_game, q


def game2():
    return new_game(make_quiz([free_round(1, [q(11)]), free_round(2, [q(21)])]))


def test_join_creates_team_with_token():
    g = game2()
    r = g.join("Котики")
    assert r.status == "joined" and r.token and g.team_by_token(r.token).name == "Котики"


def test_join_same_name_case_insensitive_creates_rejoin_request():
    g = game2()
    g.join("Котики")
    r = g.join("  котики ")
    assert r.status == "pending" and len(g.state.teams) == 1 and len(g.state.rejoin_requests) == 1


def test_approve_rejoin_replaces_token_and_keeps_score():
    g = game2()
    first = g.join("Котики")
    tid = first.team_id
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(AdjustScore(team_id=tid, delta=5))
    req = g.join("Котики")
    g.apply_admin(ApproveRejoin(request_id=req.request_id))
    assert scoring.stored_round_score(g.team_by_token(req.token), 0) == 5
    assert g.team_by_token(first.token) is None and g.state.rejoin_requests == []


def test_reject_rejoin_keeps_old_token():
    g = game2()
    first = g.join("Котики")
    req = g.join("Котики")
    g.apply_admin(RejectRejoin(request_id=req.request_id))
    assert g.team_by_token(first.token) is not None and g.state.rejoin_requests == []


@pytest.mark.parametrize("name", ["   ", "x" * 41])
def test_join_rejects_bad_names(name):
    with pytest.raises(GameError):
        game2().join(name)


def test_rename_must_stay_unique():
    g = game2()
    a = g.join("А")
    g.join("Б")
    with pytest.raises(GameError):
        g.apply_admin(RenameTeam(team_id=a.team_id, name="б"))


def test_start_game_and_round_flow():
    g = game2()
    g.apply_admin(StartGame())
    assert (g.state.stage, g.state.round_index, g.state.qr_visible) == ("intro", 0, False)
    g.apply_admin(StartRound())
    assert g.state.stage == "free" and g.state.free is not None
    g.apply_admin(NextRound())
    assert (g.state.stage, g.state.round_index, g.state.free) == ("intro", 1, None)
    with pytest.raises(GameError, match="последний"):
        g.apply_admin(NextRound())
    g.apply_admin(FinishGame())
    assert g.state.stage == "finished"


def test_start_game_without_rounds_fails():
    with pytest.raises(GameError):
        new_game(make_quiz([])).apply_admin(StartGame())


def test_undo_restores_score_but_keeps_new_teams():
    g = game2()
    a = g.join("А")
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(AdjustScore(team_id=a.team_id, delta=3))
    b = g.join("Б")
    g.apply_admin(Undo())
    assert scoring.stored_round_score(g.team(a.team_id), 0) == 0 and g.team(b.team_id).name == "Б"


def test_undo_empty_raises_and_stack_cleared_on_next_round():
    g = game2()
    a = g.join("А")
    with pytest.raises(GameError):
        g.apply_admin(Undo())
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(AdjustScore(team_id=a.team_id, delta=1))
    g.apply_admin(NextRound())
    assert g.state.undo_stack == []


def test_undo_limit():
    g = game2()
    a = g.join("А")
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    for _ in range(25):
        g.apply_admin(AdjustScore(team_id=a.team_id, delta=1))
    assert len(g.state.undo_stack) == 20


def test_audio_control_increments_seq():
    g = game2()
    g.apply_admin(AudioControl(action="pause"))
    g.apply_admin(AudioControl(action="play"))
    assert (g.state.audio.action, g.state.audio.seq) == ("play", 2)


def test_state_roundtrips_json():
    from app.game.state import GameState

    g = game2()
    g.join("А")
    g.apply_admin(StartGame())
    assert GameState.model_validate_json(g.state.model_dump_json()) == g.state
