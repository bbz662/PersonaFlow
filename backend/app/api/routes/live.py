from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings


router = APIRouter(tags=["live"])
PHRASE_CARD_TOOL_NAME = "generate_phrase_card_preview"
PHRASE_CARD_KEYWORDS = (
    "phrase card",
    "phrase cards",
    "save this phrase",
    "remember this phrase",
    "pull out a phrase",
    "turn this into a phrase",
)


def _should_request_phrase_card_tool(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in PHRASE_CARD_KEYWORDS)


def _extract_phrase_card_target(text: str) -> str:
    candidate = text.strip()
    if ":" in candidate:
        _, possible_target = candidate.split(":", 1)
        possible_target = possible_target.strip()
        if possible_target:
            return possible_target
    return candidate


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
                event_kind = str(event.get("kind") or "client_event")

                if event_kind == "user.transcript":
                    text = str(event.get("text") or "").strip()
                    source_language = str(event.get("language") or "ja")
                    turn_index = int(event.get("turn_index") or 0)

                    await websocket.send_json(
                        {
                            "type": "session.event",
                            "event": {
                                "kind": "transcript",
                                "speaker": "user",
                                "text": text or "User transcript received.",
                            },
                        }
                    )

                    if text and _should_request_phrase_card_tool(text):
                        await websocket.send_json(
                            {
                                "type": "session.event",
                                "event": {
                                    "kind": "tool_call",
                                    "tool_call": {
                                        "id": str(uuid4()),
                                        "name": PHRASE_CARD_TOOL_NAME,
                                        "arguments": {
                                            "utterance_text": _extract_phrase_card_target(text),
                                            "source_language": source_language,
                                            "turn_index": turn_index,
                                        },
                                    },
                                },
                            }
                        )
                    else:
                        await websocket.send_json(
                            {
                                "type": "session.event",
                                "event": {
                                    "kind": "assistant_response",
                                    "speaker": "agent",
                                    "text": (
                                        "Keep talking naturally. If you want, ask me to pull "
                                        "out a phrase card from something you just said."
                                    ),
                                },
                            }
                        )
                    continue

                await websocket.send_json(
                    {
                        "type": "session.event",
                        "event": {
                            "kind": event_kind,
                            "speaker": "system",
                            "text": event.get(
                                "text",
                                "Client event received by the live transport.",
                            ),
                        },
                    }
                )
                continue

            if message_type == "tool.result":
                tool_name = str(message.get("name") or "")
                call_id = str(message.get("call_id") or "")
                result = message.get("result") or {}

                await websocket.send_json(
                    {
                        "type": "session.event",
                        "event": {
                            "kind": "tool_result",
                            "tool_result": {
                                "id": call_id,
                                "name": tool_name,
                                "result": result,
                            },
                        },
                    }
                )

                cards = result.get("cards") if isinstance(result, dict) else None
                if tool_name == PHRASE_CARD_TOOL_NAME and isinstance(cards, list) and cards:
                    first_card = cards[0]
                    await websocket.send_json(
                        {
                            "type": "session.event",
                            "event": {
                                "kind": "assistant_response",
                                "speaker": "agent",
                                "text": (
                                    "I pulled out a reusable phrase card: "
                                    f"{first_card.get('english_expression', 'Preview ready.')} "
                                    f"Tone: {first_card.get('tone_tag', 'unknown')}."
                                ),
                            },
                        }
                    )
                else:
                    await websocket.send_json(
                        {
                            "type": "session.event",
                            "event": {
                                "kind": "assistant_response",
                                "speaker": "agent",
                                "text": "The tool finished, but there were no preview cards to show.",
                            },
                        }
                    )
                continue

            if message_type == "tool.error":
                tool_name = str(message.get("name") or "")
                call_id = str(message.get("call_id") or "")
                error_payload = message.get("error") or {}
                error_message = str(
                    error_payload.get("message") or "Tool execution failed in the live session."
                )

                await websocket.send_json(
                    {
                        "type": "session.event",
                        "event": {
                            "kind": "tool_error",
                            "tool_error": {
                                "id": call_id,
                                "name": tool_name,
                                "message": error_message,
                                "code": error_payload.get("code", "tool_error"),
                            },
                            "speaker": "system",
                            "text": error_message,
                        },
                    }
                )
                continue
    except WebSocketDisconnect:
        return
