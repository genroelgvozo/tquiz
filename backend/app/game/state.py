"""Serializable game state. Times are absolute epoch seconds (time.time())."""

from typing import Literal

from pydantic import BaseModel, Field

Stage = Literal["lobby", "intro", "jeopardy", "free", "finished"]
JeopardyPhase = Literal["board", "secret", "question", "answer"]
Buttons = Literal["closed", "bar", "open", "locked"]
TimerStatus = Literal["idle", "running", "paused", "finished"]
AudioAction = Literal["play", "pause", "restart", "stop"]


class Team(BaseModel):
    id: str
    name: str
    token: str
    round_scores: dict[str, int] = Field(default_factory=dict)
    joined_at: float


class RejoinRequest(BaseModel):
    id: str
    team_id: str
    token: str


class Buzz(BaseModel):
    team_id: str
    at: float


class JeopardyState(BaseModel):
    phase: JeopardyPhase = "board"
    played: list[int] = Field(default_factory=list)
    chooser_team_id: str | None = None
    question_id: int | None = None
    secret_recipient_id: str | None = None
    buttons: Buttons = "closed"
    bar_ends_at: float | None = None
    lockouts: dict[str, float] = Field(default_factory=dict)
    buzzes: list[Buzz] = Field(default_factory=list)
    answering_team_id: str | None = None
    excluded: list[str] = Field(default_factory=list)
    # the question starts (buttons/bar, printing, its audio) once the cell reveal animation is over
    starts_at: float | None = None
    # letter-by-letter printing: chars printed = typed_base + (now - typing_since) * type_speed while typing_since is set
    typed_base: float = 0.0
    typing_since: float | None = None


class Timer(BaseModel):
    status: TimerStatus = "idle"
    total_seconds: int
    input_seconds: int
    deadline: float | None = None
    remaining: float | None = None


class Answer(BaseModel):
    text: str = ""
    option: int | None = None
    stake: bool = False


class FreeState(BaseModel):
    phase: Literal["question", "review"] = "question"
    index: int = 0
    timer: Timer
    # outer key: str(question_id), inner key: team_id
    answers: dict[str, dict[str, Answer]] = Field(default_factory=dict)
    review_index: int = 0
    marks: dict[str, dict[str, bool | None]] = Field(default_factory=dict)
    # ids of questions that were opened / whose answer was shown on the screen
    opened: list[int] = Field(default_factory=list)
    revealed: list[int] = Field(default_factory=list)
    # review: the answer of the current question is shown on the screen (host's button)
    answer_shown: bool = False


class AudioCmd(BaseModel):
    action: AudioAction = "stop"
    seq: int = 0


class GameState(BaseModel):
    quiz_id: int
    stage: Stage = "lobby"
    qr_visible: bool = True
    teams: list[Team] = Field(default_factory=list)
    rejoin_requests: list[RejoinRequest] = Field(default_factory=list)
    round_index: int = -1
    closed_rounds: list[int] = Field(default_factory=list)
    jeopardy: JeopardyState | None = None
    free: FreeState | None = None
    overlay: Literal["leaderboard"] | None = None
    audio: AudioCmd = Field(default_factory=AudioCmd)
    # background music: seq changes when the track must restart; paused is the host toggle
    music_seq: int = 0
    music_paused: bool = False
    undo_stack: list[dict] = Field(default_factory=list)
