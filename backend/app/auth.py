"""Admin login (single shared password) and the big-screen key."""

import hashlib
import hmac
from collections.abc import Mapping

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.config import Settings

ADMIN_COOKIE = "tq_admin"
SCREEN_COOKIE = "tq_screen"
COOKIE_MAX_AGE = 30 * 24 * 3600


def _hmac(settings: Settings, msg: bytes) -> str:
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()


def admin_token(settings: Settings) -> str:
    return _hmac(settings, b"admin")


def screen_key(settings: Settings) -> str:
    return _hmac(settings, b"screen")[:24]


def is_admin_cookie(cookies: Mapping[str, str], settings: Settings) -> bool:
    value = cookies.get(ADMIN_COOKIE)
    return bool(value) and hmac.compare_digest(value, admin_token(settings))


def is_screen_cookie(cookies: Mapping[str, str], settings: Settings) -> bool:
    if is_admin_cookie(cookies, settings):
        return True
    value = cookies.get(SCREEN_COOKIE)
    return bool(value) and hmac.compare_digest(value, screen_key(settings))


def require_admin(request: Request) -> None:
    if not is_admin_cookie(request.cookies, request.app.state.settings):
        raise HTTPException(401, "Требуется вход")


def require_screen_or_admin(request: Request) -> None:
    if not is_screen_cookie(request.cookies, request.app.state.settings):
        raise HTTPException(401, "Требуется вход")


def _set_cookie(response: Response, settings: Settings, name: str, value: str) -> None:
    response.set_cookie(
        name,
        value,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
    )


class LoginBody(BaseModel):
    password: str


class ScreenAuthBody(BaseModel):
    key: str


router = APIRouter()


@router.post("/api/auth/login", status_code=204)
def login(body: LoginBody, request: Request, response: Response) -> None:
    settings: Settings = request.app.state.settings
    if not hmac.compare_digest(body.password.encode(), settings.admin_password.encode()):
        raise HTTPException(401, "Неверный пароль")
    _set_cookie(response, settings, ADMIN_COOKIE, admin_token(settings))


@router.post("/api/auth/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(ADMIN_COOKIE)


@router.get("/api/auth/me")
def me(request: Request) -> dict:
    return {"admin": is_admin_cookie(request.cookies, request.app.state.settings)}


@router.post("/api/screen/auth", status_code=204)
def screen_auth(body: ScreenAuthBody, request: Request, response: Response) -> None:
    settings: Settings = request.app.state.settings
    if not hmac.compare_digest(body.key, screen_key(settings)):
        raise HTTPException(403, "Неверный ключ экрана")
    _set_cookie(response, settings, SCREEN_COOKIE, screen_key(settings))
