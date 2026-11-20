"""Commands sent over WebSocket. `type` is the discriminator used on the wire."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


class _Cmd(BaseModel):
    model_config = {"extra": "ignore"}


# ---------- host: common ----------


class ShowQr(_Cmd):
    type: Literal["show_qr"] = "show_qr"
    visible: bool


class StartGame(_Cmd):
    type: Literal["start_game"] = "start_game"


class StartRound(_Cmd):
    type: Literal["start_round"] = "start_round"


class NextRound(_Cmd):
    type: Literal["next_round"] = "next_round"


class FinishGame(_Cmd):
    type: Literal["finish_game"] = "finish_game"


class RenameTeam(_Cmd):
    type: Literal["rename_team"] = "rename_team"
    team_id: str
    name: str


class DeleteTeam(_Cmd):
    type: Literal["delete_team"] = "delete_team"
    team_id: str


class ApproveRejoin(_Cmd):
    type: Literal["approve_rejoin"] = "approve_rejoin"
    request_id: str


class RejectRejoin(_Cmd):
    type: Literal["reject_rejoin"] = "reject_rejoin"
    request_id: str


class AdjustScore(_Cmd):
    type: Literal["adjust_score"] = "adjust_score"
    team_id: str
    delta: int


class Undo(_Cmd):
    type: Literal["undo"] = "undo"


class SetOverlay(_Cmd):
    type: Literal["set_overlay"] = "set_overlay"
    overlay: Literal["leaderboard"] | None = None


class AudioControl(_Cmd):
    type: Literal["audio"] = "audio"
    action: Literal["play", "pause", "restart"]


class MusicToggle(_Cmd):
    type: Literal["music_toggle"] = "music_toggle"


# ---------- host: jeopardy ----------


class SetChooser(_Cmd):
    type: Literal["set_chooser"] = "set_chooser"
    team_id: str


class OpenCell(_Cmd):
    type: Literal["open_cell"] = "open_cell"
    question_id: int


class SetSecretRecipient(_Cmd):
    type: Literal["set_secret_recipient"] = "set_secret_recipient"
    team_id: str


class OpenButtons(_Cmd):
    type: Literal["open_buttons"] = "open_buttons"


class Judge(_Cmd):
    type: Literal["judge"] = "judge"
    correct: bool


class Reveal(_Cmd):
    type: Literal["reveal"] = "reveal"


class ToBoard(_Cmd):
    type: Literal["to_board"] = "to_board"


# ---------- host: free input ----------


class OpenQuestion(_Cmd):
    type: Literal["open_question"] = "open_question"
    index: int


class TimerStart(_Cmd):
    type: Literal["timer_start"] = "timer_start"


class TimerPause(_Cmd):
    type: Literal["timer_pause"] = "timer_pause"


class TimerResume(_Cmd):
    type: Literal["timer_resume"] = "timer_resume"


class TimerAdd(_Cmd):
    type: Literal["timer_add"] = "timer_add"


class TimerFinish(_Cmd):
    type: Literal["timer_finish"] = "timer_finish"


class StartReview(_Cmd):
    type: Literal["start_review"] = "start_review"


class ReviewGoto(_Cmd):
    type: Literal["review_goto"] = "review_goto"
    index: int


class Mark(_Cmd):
    type: Literal["mark"] = "mark"
    question_id: int
    team_id: str
    correct: bool | None
    # the answer the host was looking at when marking
    text: str = ""
    option: int | None = None


# ---------- team ----------


class Join(_Cmd):
    type: Literal["join"] = "join"
    name: str


class BuzzCmd(_Cmd):
    type: Literal["buzz"] = "buzz"


class SubmitAnswer(_Cmd):
    type: Literal["answer"] = "answer"
    question_id: int | None = None  # the question the phone was showing; mismatch is rejected
    text: str = ""
    option: int | None = None
    stake: bool = False


class ReviewShowAnswer(_Cmd):
    type: Literal["review_show_answer"] = "review_show_answer"


AdminCommand = Annotated[
    Union[
        ShowQr, StartGame, StartRound, NextRound, FinishGame, RenameTeam, DeleteTeam,
        ApproveRejoin, RejectRejoin, AdjustScore, Undo, SetOverlay, AudioControl, MusicToggle,
        SetChooser, OpenCell, SetSecretRecipient, OpenButtons, Judge, Reveal, ToBoard,
        OpenQuestion, TimerStart, TimerPause, TimerResume, TimerAdd, TimerFinish,
        StartReview, ReviewGoto, ReviewShowAnswer, Mark,
    ],
    Field(discriminator="type"),
]

TeamCommand = Annotated[Union[Join, BuzzCmd, SubmitAnswer], Field(discriminator="type")]

_admin_adapter: TypeAdapter = TypeAdapter(AdminCommand)
_team_adapter: TypeAdapter = TypeAdapter(TeamCommand)


def parse_admin(data: dict) -> AdminCommand:
    return _admin_adapter.validate_python(data)


def parse_team(data: dict) -> TeamCommand:
    return _team_adapter.validate_python(data)
