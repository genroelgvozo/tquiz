"""Background music: the server decides which track plays; the screen follows."""

from typing import TYPE_CHECKING

from pydantic import BaseModel

from app.game import freeinput
from app.game.commands import MusicToggle
from app.game.errors import GameError

if TYPE_CHECKING:
    from app.game.engine import Game


class MusicNow(BaseModel):
    url: str
    key: str  # the screen restarts the track when the key changes
    playing: bool


def current_music(game: "Game") -> MusicNow | None:
    st = game.state
    if st.stage == "lobby":
        track, name = game.quiz.lobby_music, "lobby"
        timer_ok = True
    elif st.stage == "intro":
        track, name = game.current_round().intro_music, "intro"
        timer_ok = True
    elif st.stage == "free" and st.free is not None and st.free.phase == "question":
        media = freeinput.current_question(game).media
        if media is not None and media.kind == "audio":
            return None
        status = st.free.timer.status
        if status not in ("running", "paused"):
            return None
        track, name = game.current_round().think_music, "think"
        timer_ok = status == "running"
    else:
        return None
    if track is None:
        return None
    playing = not st.music_paused and st.overlay is None and timer_ok
    return MusicNow(url=track.url, key=f"{name}:{st.music_seq}", playing=playing)


def _toggle(game: "Game", cmd: MusicToggle) -> None:
    if current_music(game) is None:
        raise GameError("Сейчас фоновая музыка не играет")
    game.state.music_paused = not game.state.music_paused


HANDLERS: dict = {MusicToggle: _toggle}
