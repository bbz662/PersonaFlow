import os
import unittest
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import create_app
except ModuleNotFoundError:
    TestClient = None
    WebSocketDisconnect = None
    create_app = None


@unittest.skipUnless(TestClient is not None, "fastapi is not installed in the test environment")
class LiveApiTests(unittest.TestCase):
    def tearDown(self) -> None:
        from app.core.config import get_settings

        get_settings.cache_clear()

    def test_live_transport_connects_when_realtime_voice_enabled(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            from app.core.config import get_settings

            get_settings.cache_clear()
            app = create_app()
            client = TestClient(app)

            with client.websocket_connect("/sessions/session-123/live") as websocket:
                payload = websocket.receive_json()

        self.assertEqual(payload["type"], "connection.state")
        self.assertEqual(payload["state"], "connected")
        self.assertEqual(payload["session_id"], "session-123")

    def test_live_transport_rejects_connection_when_realtime_voice_disabled(self) -> None:
        with patch.dict(os.environ, {"REALTIME_VOICE_ENABLED": "false"}, clear=True):
            from app.core.config import get_settings

            get_settings.cache_clear()
            app = create_app()
            client = TestClient(app)

            with self.assertRaises(WebSocketDisconnect) as context:
                with client.websocket_connect("/sessions/session-123/live"):
                    pass

        self.assertEqual(context.exception.code, 1008)

    def test_live_transport_requests_phrase_card_tool_and_accepts_result(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            from app.core.config import get_settings

            get_settings.cache_clear()
            app = create_app()
            client = TestClient(app)

            with client.websocket_connect("/sessions/session-123/live") as websocket:
                websocket.receive_json()
                websocket.receive_json()

                websocket.send_json(
                    {
                        "type": "client.event",
                        "event": {
                            "kind": "user.transcript",
                            "text": (
                                "Turn this into a phrase card: I stayed in, made curry, "
                                "and talked with my sister for hours."
                            ),
                            "language": "ja",
                            "turn_index": 2,
                        },
                    }
                )

                transcript_event = websocket.receive_json()
                tool_event = websocket.receive_json()

                self.assertEqual(transcript_event["event"]["speaker"], "user")
                self.assertIn("I stayed in", transcript_event["event"]["text"])
                self.assertEqual(tool_event["event"]["kind"], "tool_call")
                self.assertEqual(
                    tool_event["event"]["tool_call"]["name"],
                    "generate_phrase_card_preview",
                )
                self.assertEqual(
                    tool_event["event"]["tool_call"]["arguments"]["utterance_text"],
                    "I stayed in, made curry, and talked with my sister for hours.",
                )

                websocket.send_json(
                    {
                        "type": "tool.result",
                        "call_id": tool_event["event"]["tool_call"]["id"],
                        "name": "generate_phrase_card_preview",
                        "result": {
                            "tool_name": "generate_phrase_card_preview",
                            "summary": "Prepared 1 phrase card preview.",
                            "card_count": 1,
                            "cards": [
                                {
                                    "english_expression": (
                                        "I stayed in, made curry, and talked with my sister "
                                        "for hours."
                                    ),
                                    "tone_tag": "warm",
                                }
                            ],
                        },
                    }
                )

                tool_result_event = websocket.receive_json()
                assistant_event = websocket.receive_json()

                self.assertEqual(tool_result_event["event"]["kind"], "tool_result")
                self.assertEqual(
                    tool_result_event["event"]["tool_result"]["name"],
                    "generate_phrase_card_preview",
                )
                self.assertEqual(assistant_event["event"]["speaker"], "agent")
                self.assertIn("Tone: warm", assistant_event["event"]["text"])
