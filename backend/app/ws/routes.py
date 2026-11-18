from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.websocket("/ws/admin")
async def ws_admin(ws: WebSocket) -> None:
    await ws.app.state.hub.serve_admin(ws)


@router.websocket("/ws/screen")
async def ws_screen(ws: WebSocket) -> None:
    await ws.app.state.hub.serve_screen(ws)


@router.websocket("/ws/team")
async def ws_team(ws: WebSocket, token: str | None = None) -> None:
    await ws.app.state.hub.serve_team(ws, token)
