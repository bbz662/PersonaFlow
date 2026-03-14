from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings


router = APIRouter(tags=["live"])


@router.websocket("/sessions/{session_id}/live")
async def live_session_transport(websocket: WebSocket, session_id: str) -> None:
    settings = get_settings()

    if not settings.realtime_voice_enabled:
        await websocket.close(code=1008, reason="Realtime voice is disabled.")
        return

    await websocket.accept()
    await websocket.send_json(
        {
            "type": "connection.state",
            "state": "connected",
            "session_id": session_id,
        }
    )
    await websocket.send_json(
        {
            "type": "session.event",
            "event": {
                "kind": "transport_ready",
                "speaker": "agent",
                "text": "Live transport connected. Transcript capture and agent responses can attach here next.",
            },
        }
    )

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "session.end":
                await websocket.send_json(
                    {
                        "type": "connection.state",
                        "state": "ended",
                        "session_id": session_id,
                    }
                )
                await websocket.close()
                return

            if message_type == "client.event":
                event = message.get("event") or {}
                await websocket.send_json(
                    {
                        "type": "session.event",
                        "event": {
                            "kind": event.get("kind", "client_event"),
                            "speaker": "system",
                            "text": event.get(
                                "text",
                                "Client event received by the live transport.",
                            ),
                        },
                    }
                )
    except WebSocketDisconnect:
        return
