import pytest

from app.game.commands import *  # noqa: F403
from app.game.engine import GameError
from app.game.music import current_music
from app.game.views import admin_view, screen_view, team_view
from app.quizdata import media_ref
from tests.factories import FakeClock, free_round, jeopardy_round, make_quiz, new_game, q

MP3 = media_ref("d" * 32 + ".mp3", "audio")


def free_game(think=MP3, intro=MP3, lobby=MP3, questions=None):
    qs = questions or [q(1), q(2)]
    quiz = make_quiz([free_round(1, qs, intro_music=intro, think_music=think), free_round(2, [q(3)])], lobby_music=lobby)
    g = new_game(quiz, FakeClock())
    return g


def test_lobby_music_plays_and_none_without_track():
    g = free_game()
    m = current_music(g)
    assert m.key == "lobby:0" and m.playing and m.url == MP3.url
    assert current_music(free_game(lobby=None)) is None


def test_intro_music_new_key_per_round_and_toggle_reset():
    g = free_game()
    g.apply_admin(StartGame())
    assert current_music(g).key == "intro:1"
    g.apply_admin(MusicToggle())
    assert not current_music(g).playing and g.state.music_paused
    g.apply_admin(NextRound())
    m = current_music(g)
    assert m is None  # round 2 has no intro music
    assert g.state.music_seq == 2 and not g.state.music_paused


def test_next_round_key_and_playing():
    quiz = make_quiz([free_round(1, [q(1)], intro_music=MP3), free_round(2, [q(2)], intro_music=MP3)])
    g = new_game(quiz)
    g.apply_admin(StartGame())
    g.apply_admin(MusicToggle())
    g.apply_admin(NextRound())
    m = current_music(g)
    assert m.key == "intro:2" and m.playing


def test_leaderboard_overlay_pauses_without_new_context():
    g = free_game()
    g.apply_admin(StartGame())
    g.apply_admin(SetOverlay(overlay="leaderboard"))
    m = current_music(g)
    assert not m.playing and m.key == "intro:1"
    g.apply_admin(SetOverlay(overlay=None))
    m = current_music(g)
    assert m.playing and m.key == "intro:1"


def test_think_music_follows_timer():
    g = free_game()
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    assert current_music(g) is None
    g.apply_admin(TimerStart())
    m = current_music(g)
    assert m.key == f"think:{g.state.music_seq}" and m.playing
    g.apply_admin(TimerPause())
    p = current_music(g)
    assert not p.playing and p.key == m.key
    g.apply_admin(TimerResume())
    assert current_music(g).playing
    g.apply_admin(TimerFinish())
    assert current_music(g) is None
    g.apply_admin(OpenQuestion(index=1))
    g.apply_admin(TimerStart())
    assert current_music(g).key != m.key


def test_no_think_music_on_audio_question():
    g = free_game(questions=[q(1, media=MP3)])
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    g.apply_admin(TimerStart())
    assert current_music(g) is None


def test_toggle_without_music_is_error():
    quiz = make_quiz([jeopardy_round(1, [("A", [q(1)])])], lobby_music=MP3)
    g = new_game(quiz)
    g.apply_admin(StartGame())
    g.apply_admin(StartRound())
    with pytest.raises(GameError, match="Сейчас фоновая музыка не играет"):
        g.apply_admin(MusicToggle())


def test_views_carry_music():
    g = free_game()
    g.join("Альфа")
    tid = g.state.teams[0].id
    m = current_music(g)
    assert m is not None
    assert screen_view(g, "u").music == m
    assert admin_view(g, "u", set()).state.music == m
    assert ".mp3" not in team_view(g, tid).model_dump_json()
