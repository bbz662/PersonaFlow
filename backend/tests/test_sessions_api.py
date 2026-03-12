import unittest
from unittest.mock import Mock

try:
    from fastapi.testclient import TestClient

    from app.api.routes.sessions import get_session_repository
    from app.main import create_app
except ModuleNotFoundError:
    TestClient = None
    get_session_repository = None
    create_app = None


@unittest.skipUnless(TestClient is not None, "fastapi is not installed in the test environment")
class SessionApiTests(unittest.TestCase):
    def test_start_session_uses_defaults_and_returns_started_session(self) -> None:
        repository = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post("/sessions/start")

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["status"], "started")
        self.assertTrue(payload["session_id"])
        self.assertTrue(payload["started_at"])
        repository.create_session.assert_called_once_with(
            payload["session_id"],
            {
                "user_id": "anonymous",
                "source_language": "ja",
                "target_language": "en",
                "status": "started",
                "started_at": payload["started_at"],
            },
        )

    def test_start_session_accepts_language_overrides(self) -> None:
        repository = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post(
            "/sessions/start",
            json={"source_language": "ko", "target_language": "en"},
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        repository.create_session.assert_called_once_with(
            payload["session_id"],
            {
                "user_id": "anonymous",
                "source_language": "ko",
                "target_language": "en",
                "status": "started",
                "started_at": payload["started_at"],
            },
        )
