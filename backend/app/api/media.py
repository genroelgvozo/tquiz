"""Media upload (admin) and protected serving (admin or big screen)."""

import re
import secrets
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.auth import require_admin, require_screen_or_admin

IMAGE_EXT = {"jpg", "jpeg", "png", "webp", "gif"}
AUDIO_EXT = {"mp3", "m4a", "ogg", "wav"}
LIMITS_MB = {"image": 10, "audio": 20}
CHUNK = 1024 * 1024
FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif|mp3|m4a|ogg|wav)$")

router = APIRouter()


def media_kind_of(filename: str) -> Literal["image", "audio"] | None:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    return None


def _media_dir(request: Request) -> Path:
    return request.app.state.settings.data_dir / "media"


def _unsupported(ext: str) -> HTTPException:
    shown = ext.upper() or "без расширения"
    detail = f"Формат не поддерживается: {shown}. Картинки: JPG, PNG, WEBP, GIF; аудио: MP3, M4A, OGG, WAV"
    if ext in ("heic", "heif"):
        detail += " — сохраните фото как JPG"
    return HTTPException(400, detail)


@router.post("/api/media", dependencies=[Depends(require_admin)])
async def upload_media(file: UploadFile, request: Request) -> dict:
    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in IMAGE_EXT:
        kind = "image"
    elif ext in AUDIO_EXT:
        kind = "audio"
    else:
        raise _unsupported(ext)

    limit = LIMITS_MB[kind] * 1024 * 1024
    filename = f"{secrets.token_hex(16)}.{ext}"
    target = _media_dir(request) / filename
    size = 0
    try:
        with target.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Файл больше {LIMITS_MB[kind]} МБ")
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    return {"filename": filename, "kind": kind, "url": f"/media/{filename}"}


@router.get("/media/{filename}", dependencies=[Depends(require_screen_or_admin)])
def get_media(filename: str, request: Request) -> FileResponse:
    if not FILENAME_RE.match(filename):
        raise HTTPException(404, "Не найдено")
    path = _media_dir(request) / filename
    if not path.is_file():
        raise HTTPException(404, "Не найдено")
    return FileResponse(path)
