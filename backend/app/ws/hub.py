"""Hub: owns the single active Game, applies commands, persists and broadcasts role views."""

import asyncio
import json
import logging
from collections.abc import Iterable
from typing import Literal

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import Engine
from sqlmodel import Session

from app.auth import is_admin_cookie, is_screen_cookie
from app.config import Settings
from app.game import store
from app.game.commands import ApproveRejoin, DeleteTeam, Join, RejectRejoin, parse_admin, parse_team
from app.game.engine import Game, GameError
from app.game.views import admin_view, screen_view, team_view
from app.quizdata import load_quiz_data

log = logging.getLogger(__name__)

TICK_INTERVAL = 0.2
UNAUTHORIZED = 4401


def screen_sound_status(flags: Iterable[bool]) -> Literal["none", "on", "off"]:
    flags = list(flags)
    if not flags:
        return "none"
    return "on" if any(flags) else "off"


class Hub:
    def __init__(self, settings: Settings, db: Engine):
        self.settings = settings
        self.db = db
        self.game: Game | None = None
        self.lock = asyncio.Lock()
        self.admins: set[WebSocket] = set()
        self.screens: set[WebSocket] = set()
        self.screen_sound: dict[WebSocket, bool] = {}  # screen socket -> its sound is on
        self.teams: dict[str, WebSocket] = {}  # team_id -> socket of its (single) phone
        self.unjoined: set[WebSocket] = set()  # team sockets not bound to a team
        self.pending: dict[str, WebSocket] = {}  # rejoin request_id -> waiting socket

    # ---------- properties ----------

    @property
    def join_url(self) -> str:
        return self.settings.public_url.rstrip("/") + "/play"

    @property
    def locked_quiz_id(self) -> int | None:
        return self.game.quiz.id if self.game else None

    # ---------- lifecycle ----------

    def restore(self) -> None:
        try:
            loaded = store.load_game(self.db)
        except (ValidationError, ValueError):
            log.warning("stored game state is invalid (old schema?) — discarding it", exc_info=True)
            store.clear_game(self.db)
            return
        if loaded is None:
            return
        quiz_id, state = loaded
        try:
            with Session(self.db) as session:
                quiz = load_quiz_data(session, quiz_id)
        except LookupError:
            store.clear_game(self.db)
            return
        self.game = Game(quiz, state)

    async def start_game(self, quiz_id: int) -> None:
        async with self.lock:
            with Session(self.db) as session:
                quiz = load_quiz_data(session, quiz_id)
            self.game = Game.new(quiz)
            store.save_game(self.db, self.game)
            self._unbind_all_teams()
            await self._send_many(self.unjoined, self._need_join_message())
            await self._broadcast()

    async def stop_game(self) -> None:
        async with self.lock:
            self.game = None
            store.clear_game(self.db)
            self._unbind_all_teams()
            await self._send_many(self.unjoined, {"type": "no_game"})
            await self._broadcast()

    async def run_ticks(self) -> None:
        while True:
            await asyncio.sleep(TICK_INTERVAL)
            if self.game is None:
                continue
            try:
                async with self.lock:
                    if self.game is not None and self.game.tick():
                        self._save()
                        await self._broadcast()
            except Exception:
                log.exception("tick failed")

    # ---------- connections ----------

    async def serve_admin(self, ws: WebSocket) -> None:
        if not is_admin_cookie(ws.cookies, self.settings):
            await ws.close(code=UNAUTHORIZED)
            return
        await ws.accept()
        async with self.lock:
            self.admins.add(ws)
            await self._send(ws, self._admin_message())
        try:
            while True:
                data = await self._receive(ws)
                if data is not None:
                    await self._handle_admin(ws, data)
        except WebSocketDisconnect:
            pass
        finally:
            async with self.lock:
                self.admins.discard(ws)

    async def serve_screen(self, ws: WebSocket) -> None:
        if not is_screen_cookie(ws.cookies, self.settings):
            await ws.close(code=UNAUTHORIZED)
            return
        await ws.accept()
        async with self.lock:
            self.screens.add(ws)
            self.screen_sound[ws] = False
            await self._send(ws, self._screen_message())
            await self._broadcast_admins()
        try:
            while True:
                data = await self._receive(ws)
                if data is not None and data.get("type") == "sound":
                    async with self.lock:
                        if ws in self.screen_sound:
                            self.screen_sound[ws] = data.get("on") is True
                            await self._broadcast_admins()
        except WebSocketDisconnect:
            pass
        finally:
            async with self.lock:
                self.screens.discard(ws)
                self.screen_sound.pop(ws, None)
                await self._broadcast_admins()

    async def serve_team(self, ws: WebSocket, token: str | None) -> None:
        await ws.accept()
        async with self.lock:
            if self.game is None:
                self.unjoined.add(ws)
                await self._send(ws, {"type": "no_game"})
            else:
                team = self.game.team_by_token(token or "")
                if team is None:
                    self.unjoined.add(ws)
                    await self._send(ws, self._need_join_message())
                else:
                    await self._bind(team.id, ws)
                    await self._send(ws, self._team_message(team.id))
                    await self._broadcast_admins()
        try:
            while True:
                data = await self._receive(ws)
                if data is not None:
                    await self._handle_team(ws, data)
        except WebSocketDisconnect:
            pass
        finally:
            async with self.lock:
                self.unjoined.discard(ws)
                dropped = [rid for rid, s in self.pending.items() if s is ws]
                for rid in dropped:
                    del self.pending[rid]
                    self._drop_request(rid)
                gone = [tid for tid, s in self.teams.items() if s is ws]
                for tid in gone:
                    del self.teams[tid]
                if dropped:
                    self._save()
                if gone or dropped:
                    await self._broadcast_admins()

    # ---------- command handling ----------

    async def _handle_admin(self, ws: WebSocket, data: dict) -> None:
        try:
            cmd = parse_admin(data)
        except ValidationError:
            await self._send(ws, {"type": "error", "message": "Неверная команда"})
            return
        async with self.lock:
            game = self.game
            if game is None:
                await self._send(ws, {"type": "error", "message": "Нет активной игры"})
                return
            request = None
            if isinstance(cmd, (ApproveRejoin, RejectRejoin)):
                request = next((r for r in game.state.rejoin_requests if r.id == cmd.request_id), None)
            if isinstance(cmd, ApproveRejoin) and request is not None and request.id not in self.pending:
                self._drop_request(request.id)
                self._save()
                await self._broadcast()
                await self._send(ws, {"type": "error", "message": "Устройство отключилось — пусть войдут заново"})
                return
            deleted_requests = []
            if isinstance(cmd, DeleteTeam):
                deleted_requests = [r.id for r in game.state.rejoin_requests if r.team_id == cmd.team_id]
            try:
                game.apply_admin(cmd)
            except GameError as e:
                await self._send(ws, {"type": "error", "message": str(e)})
                return

            if isinstance(cmd, ApproveRejoin) and request is not None:
                new_ws = self.pending.pop(request.id, None)
                old_ws = self.teams.pop(request.team_id, None)
                if old_ws is not None and old_ws is not new_ws:
                    await self._send(old_ws, {"type": "kicked"})
                    await self._close(old_ws)
                if new_ws is not None:
                    self.unjoined.discard(new_ws)
                    self.teams[request.team_id] = new_ws
                    await self._send(new_ws, {"type": "joined", "token": request.token})
            elif isinstance(cmd, RejectRejoin) and request is not None:
                waiting = self.pending.pop(request.id, None)
                if waiting is not None:
                    self.unjoined.add(waiting)
                    await self._send(waiting, {"type": "rejected"})
            elif isinstance(cmd, DeleteTeam):
                sockets = [self.teams.pop(cmd.team_id, None)] + [self.pending.pop(r, None) for r in deleted_requests]
                for s in sockets:
                    if s is not None:
                        self.unjoined.add(s)
                        await self._send(s, self._need_join_message())

            self._save()
            await self._broadcast()

    async def _handle_team(self, ws: WebSocket, data: dict) -> None:
        try:
            cmd = parse_team(data)
        except ValidationError:
            await self._send(ws, {"type": "error", "message": "Неверная команда"})
            return
        async with self.lock:
            game = self.game
            if game is None:
                await self._send(ws, {"type": "no_game"})
                return
            if isinstance(cmd, Join):
                await self._join(ws, game, cmd)
                return
            team_id = next((tid for tid, s in self.teams.items() if s is ws), None)
            if team_id is None:
                await self._send(ws, self._need_join_message())
                return
            try:
                game.apply_team(team_id, cmd)
            except GameError as e:
                await self._send(ws, {"type": "error", "message": str(e)})
                return
            self._save()
            await self._broadcast()

    async def _join(self, ws: WebSocket, game: Game, cmd: Join) -> None:
        if any(s is ws for s in self.teams.values()):
            await self._send(ws, {"type": "error", "message": "Вы уже в игре"})
            return
        try:
            result = game.join(cmd.name)
        except GameError as e:
            await self._send(ws, {"type": "error", "message": str(e)})
            return
        if result.status == "joined":
            self.unjoined.discard(ws)
            self.teams[result.team_id] = ws
            await self._send(ws, {"type": "joined", "token": result.token})
        else:
            self.pending[result.request_id] = ws
            await self._send(ws, {"type": "pending"})
        self._save()
        await self._broadcast()

    # ---------- internals ----------

    async def _bind(self, team_id: str, ws: WebSocket) -> None:
        """A new socket with the same token replaces the old one (e.g. a phone waking up)."""
        self.unjoined.discard(ws)
        old = self.teams.get(team_id)
        self.teams[team_id] = ws
        if old is not None and old is not ws:
            await self._close(old)

    def _drop_request(self, request_id: str) -> None:
        if self.game is None:
            return
        try:
            self.game.apply_admin(RejectRejoin(request_id=request_id))
        except GameError:
            pass  # already gone

    def _unbind_all_teams(self) -> None:
        self.unjoined.update(self.teams.values())
        self.unjoined.update(self.pending.values())
        self.teams.clear()
        self.pending.clear()

    def _save(self) -> None:
        if self.game is not None:
            store.save_game(self.db, self.game)

    def _admin_message(self) -> dict:
        if self.game is None:
            return {"type": "state", "view": None}
        view = admin_view(
            self.game, self.join_url, set(self.teams), screen_sound_status(self.screen_sound.values())
        )
        return {"type": "state", "view": view.model_dump(mode="json")}

    def _screen_message(self) -> dict:
        if self.game is None:
            return {"type": "state", "view": None}
        return {"type": "state", "view": screen_view(self.game, self.join_url).model_dump(mode="json")}

    def _need_join_message(self) -> dict:
        message: dict = {"type": "need_join"}
        if self.game is not None:
            message["theme"] = self.game.quiz.theme.model_dump(mode="json")
        return message

    def _team_message(self, team_id: str) -> dict:
        return {"type": "state", "view": team_view(self.game, team_id).model_dump(mode="json")}

    async def _broadcast_admins(self) -> None:
        if self.admins:
            await self._send_many(self.admins, self._admin_message())

    async def _broadcast(self) -> None:
        await self._broadcast_admins()
        if self.screens:
            await self._send_many(self.screens, self._screen_message())
        if self.game is not None:
            for team_id, ws in list(self.teams.items()):
                if self.game.find_team(team_id) is not None:
                    await self._send(ws, self._team_message(team_id))

    async def _send_many(self, sockets, message: dict) -> None:
        for ws in list(sockets):
            await self._send(ws, message)

    async def _send(self, ws: WebSocket, message: dict) -> None:
        try:
            await ws.send_json(message)
        except Exception:  # socket already gone; its serve loop will clean up
            log.debug("send failed", exc_info=True)

    async def _close(self, ws: WebSocket) -> None:
        try:
            await ws.close()
        except Exception:
            log.debug("close failed", exc_info=True)

    async def _receive(self, ws: WebSocket) -> dict | None:
        text = await ws.receive_text()
        try:
            data = json.loads(text)
        except ValueError:
            return None
        if not isinstance(data, dict):
            return None
        if data.get("type") == "ping":
            await self._send(ws, {"type": "pong"})
            return None
        return data
