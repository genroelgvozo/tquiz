"""Per-round scores. Points live in Team.round_scores; the total counts only closed rounds."""

from typing import TYPE_CHECKING

from app.game import freeinput
from app.game.state import Team

if TYPE_CHECKING:
    from app.game.engine import Game


def add_points(team: Team, round_index: int, delta: int) -> None:
    key = str(round_index)
    team.round_scores[key] = team.round_scores.get(key, 0) + delta


def stored_round_score(team: Team, round_index: int) -> int:
    return team.round_scores.get(str(round_index), 0)


def total(game: "Game", team: Team) -> int:
    return sum(stored_round_score(team, i) for i in game.state.closed_rounds)


def current_round_score(game: "Game", team: Team) -> int | None:
    stage = game.state.stage
    if stage not in ("jeopardy", "free"):
        return None
    score = stored_round_score(team, game.state.round_index)
    if stage == "free":
        score += freeinput.round_points(game).get(team.id, 0)
    return score


def close_current_round(game: "Game") -> None:
    st = game.state
    if st.stage not in ("jeopardy", "free") or st.round_index in st.closed_rounds:
        return
    if st.stage == "free":
        points = freeinput.round_points(game)
        for team in st.teams:
            add_points(team, st.round_index, points.get(team.id, 0))
    st.closed_rounds.append(st.round_index)


def adjust_round(game: "Game") -> int | None:
    st = game.state
    if st.stage in ("jeopardy", "free"):
        return st.round_index
    if st.stage in ("intro", "finished") and st.closed_rounds:
        return st.closed_rounds[-1]
    return None
