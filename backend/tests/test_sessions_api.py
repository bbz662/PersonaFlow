import unittest
from unittest.mock import ANY, Mock

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

    def test_ingest_transcript_stores_multiple_entries(self) -> None:
        repository = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post(
            "/sessions/session-123/transcript",
            json={
                "entries": [
                    {
                        "entry_id": "entry-1",
                        "speaker": "user",
                        "text": "I had fun today",
                        "language": "ja",
                        "timestamp": "2026-03-13T10:00:00Z",
                        "turn_index": 0,
                    },
                    {
                        "speaker": "agent",
                        "text": "That sounds fun.",
                        "language": "en",
                        "timestamp": "2026-03-13T10:00:05Z",
                        "turn_index": 1,
                    },
                ]
            },
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["session_id"], "session-123")
        self.assertEqual(payload["stored_count"], 2)
        self.assertEqual(payload["entries"][0]["entry_id"], "entry-1")
        self.assertTrue(payload["entries"][1]["entry_id"])
        repository.add_transcript_entry.assert_any_call(
            "session-123",
            "entry-1",
            {
                "entry_id": "entry-1",
                "speaker": "user",
                "text": "I had fun today",
                "language": "ja",
                "timestamp": "2026-03-13T10:00:00+00:00",
                "turn_index": 0,
            },
        )
        repository.add_transcript_entry.assert_any_call(
            "session-123",
            ANY,
            {
                "entry_id": ANY,
                "speaker": "agent",
                "text": "That sounds fun.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:05+00:00",
                "turn_index": 1,
            },
        )
        self.assertEqual(repository.add_transcript_entry.call_count, 2)

    def test_ingest_transcript_rejects_missing_entries(self) -> None:
        repository = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post("/sessions/session-123/transcript", json={"entries": []})

        self.assertEqual(response.status_code, 422)
        repository.add_transcript_entry.assert_not_called()

    def test_ingest_transcript_rejects_invalid_entry_fields(self) -> None:
        repository = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post(
            "/sessions/session-123/transcript",
            json={
                "entries": [
                    {
                        "speaker": "system",
                        "text": "   ",
                        "language": "",
                        "timestamp": "not-a-timestamp",
                        "turn_index": -1,
                    }
                ]
            },
        )

        self.assertEqual(response.status_code, 422)
        repository.add_transcript_entry.assert_not_called()
