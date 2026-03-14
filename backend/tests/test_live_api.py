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
