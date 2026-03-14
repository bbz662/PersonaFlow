import unittest
from unittest.mock import ANY, Mock

try:
    from fastapi.testclient import TestClient

    from app.api.routes.sessions import (
        get_phrase_card_service,
        get_session_repository,
        get_session_summary_service,
    )
    from app.main import create_app
except ModuleNotFoundError:
    TestClient = None
    get_phrase_card_service = None
    get_session_repository = None
    get_session_summary_service = None
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

    def test_complete_session_marks_processing_then_completed(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {"session_id": "session-123"}
        repository.list_phrase_cards.return_value = []
        repository.list_transcript_entries.return_value = [
            {
                "entry_id": "entry-1",
                "speaker": "user",
                "text": "I always need a little time to warm up in new groups.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:00+00:00",
                "turn_index": 0,
            },
            {
                "entry_id": "entry-2",
                "speaker": "user",
                "text": "Once I get comfortable, I talk a lot more.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:15+00:00",
                "turn_index": 1,
            },
            {
                "entry_id": "entry-3",
                "speaker": "user",
                "text": "I like keeping things relaxed instead of too formal.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:30+00:00",
                "turn_index": 2,
            },
        ]
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post("/sessions/session-123/complete")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["session_id"], "session-123")
        self.assertEqual(payload["status"], "completed")
        self.assertTrue(payload["ended_at"])
        self.assertTrue(payload["processing_started_at"])
        self.assertTrue(payload["completed_at"])
        self.assertEqual(payload["card_count"], 3)
        repository.get_session.assert_any_call("session-123")
        repository.update_session.assert_any_call(
            "session-123",
            {
                "status": "processing",
                "ended_at": payload["ended_at"],
                "processing_started_at": payload["processing_started_at"],
            },
        )
        repository.update_session.assert_any_call(
            "session-123",
            {
                "status": "completed",
                "completed_at": payload["completed_at"],
                "card_count": 3,
                "session_summary": ANY,
            },
        )
        self.assertEqual(repository.update_session.call_count, 2)
        self.assertEqual(repository.add_phrase_card.call_count, 3)

    def test_complete_session_returns_not_found_for_missing_session(self) -> None:
        repository = Mock()
        repository.get_session.return_value = None
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        client = TestClient(app)

        response = client.post("/sessions/missing-session/complete")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Session not found."})
        repository.get_session.assert_called_once_with("missing-session")
        repository.update_session.assert_not_called()

    def test_get_session_metadata_returns_summary_and_fields(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {
            "session_id": "session-123",
            "status": "completed",
            "source_language": "ja",
            "target_language": "en",
            "started_at": "2026-03-13T10:00:00+00:00",
            "ended_at": "2026-03-13T10:10:00+00:00",
            "processing_started_at": "2026-03-13T10:10:00+00:00",
            "completed_at": "2026-03-13T10:10:02+00:00",
            "card_count": 3,
            "session_summary": "A real summary from the completed session.",
        }
        session_summary_service = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_session_summary_service] = lambda: session_summary_service
        client = TestClient(app)

        response = client.get("/sessions/session-123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "session_id": "session-123",
                "status": "completed",
                "source_language": "ja",
                "target_language": "en",
                "started_at": "2026-03-13T10:00:00+00:00",
                "ended_at": "2026-03-13T10:10:00+00:00",
                "processing_started_at": "2026-03-13T10:10:00+00:00",
                "completed_at": "2026-03-13T10:10:02+00:00",
                "card_count": 3,
                "session_summary": "A real summary from the completed session.",
            },
        )
        repository.get_session.assert_any_call("session-123")
        session_summary_service.generate_for_session.assert_not_called()

    def test_get_session_metadata_generates_missing_summary_for_completed_session(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {
            "session_id": "session-123",
            "status": "completed",
            "card_count": 2,
        }
        session_summary_service = Mock()
        session_summary_service.generate_for_session.return_value = "Generated summary"
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_session_summary_service] = lambda: session_summary_service
        client = TestClient(app)

        response = client.get("/sessions/session-123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["session_summary"], "Generated summary")
        session_summary_service.generate_for_session.assert_called_once_with("session-123")
        repository.update_session.assert_called_once_with(
            "session-123", {"session_summary": "Generated summary"}
        )

    def test_list_phrase_cards_returns_frontend_ready_shape(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {"session_id": "session-123"}
        phrase_card_service = Mock()
        phrase_card_service.list_for_session.return_value = [
            {
                "card_id": "card-1",
                "source_text": "I like keeping things relaxed instead of too formal.",
                "english_expression": "I like keeping things relaxed instead of too formal.",
                "tone_tag": "casual",
                "usage_note": "Use this to describe your style in a natural way.",
                "created_at": "2026-03-13T10:10:00+00:00",
            }
        ]
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.get("/sessions/session-123/cards")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "session_id": "session-123",
                "card_count": 1,
                "cards": [
                    {
                        "card_id": "card-1",
                        "source_text": "I like keeping things relaxed instead of too formal.",
                        "english_expression": "I like keeping things relaxed instead of too formal.",
                        "tone_tag": "casual",
                        "usage_note": "Use this to describe your style in a natural way.",
                        "created_at": "2026-03-13T10:10:00+00:00",
                    }
                ],
            },
        )
        repository.get_session.assert_any_call("session-123")
        phrase_card_service.list_for_session.assert_called_once_with("session-123")

    def test_preview_phrase_cards_returns_tool_ready_shape(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {"session_id": "session-123"}
        phrase_card_service = Mock()
        phrase_card_service.preview_for_text.return_value = [
            {
                "source_text": "I stayed in and made curry.",
                "english_expression": "I stayed in and made curry.",
                "tone_tag": "warm",
                "usage_note": "Use this for a casual personal recap.",
            }
        ]
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.post(
            "/sessions/session-123/tools/phrase-card-preview",
            json={
                "utterance_text": "I stayed in and made curry.",
                "source_language": "ja",
                "turn_index": 4,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "tool_name": "generate_phrase_card_preview",
                "summary": "Prepared 1 phrase card previews from the latest learner turn.",
                "card_count": 1,
                "cards": [
                    {
                        "card_id": "preview-1",
                        "source_text": "I stayed in and made curry.",
                        "english_expression": "I stayed in and made curry.",
                        "tone_tag": "warm",
                        "usage_note": "Use this for a casual personal recap.",
                        "created_at": "preview",
                    }
                ],
            },
        )
        phrase_card_service.preview_for_text.assert_called_once_with(
            text="I stayed in and made curry.",
            source_language="ja",
            turn_index=4,
        )
        repository.get_session.assert_any_call("session-123")

    def test_voice_agent_tool_execute_returns_structured_result(self) -> None:
        repository = Mock()
        repository.get_session.return_value = {"session_id": "session-123"}
        phrase_card_service = Mock()
        phrase_card_service.preview_for_text.return_value = [
            {
                "source_text": "I stayed in and made curry.",
                "english_expression": "I stayed in and made curry.",
                "tone_tag": "warm",
                "usage_note": "Use this for a casual personal recap.",
            }
        ]
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.post(
            "/voice-agent/tools/execute",
            headers={"X-Request-ID": "req-123"},
            json={
                "session_id": "session-123",
                "tool_name": "generate_phrase_card_preview",
                "arguments": {
                    "utterance_text": "I stayed in and made curry.",
                    "source_language": "ja",
                    "turn_index": 4,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "req-123")
        self.assertEqual(
            response.json(),
            {
                "request_id": "req-123",
                "session_id": "session-123",
                "tool_name": "generate_phrase_card_preview",
                "status": "completed",
                "result": {
                    "summary": "Prepared 1 phrase card previews from the latest learner turn.",
                    "card_count": 1,
                    "cards": [
                        {
                            "card_id": "preview-1",
                            "source_text": "I stayed in and made curry.",
                            "english_expression": "I stayed in and made curry.",
                            "tone_tag": "warm",
                            "usage_note": "Use this for a casual personal recap.",
                            "created_at": "preview",
                        }
                    ],
                },
            },
        )
        repository.get_session.assert_any_call("session-123")
        phrase_card_service.preview_for_text.assert_called_once_with(
            text="I stayed in and made curry.",
            source_language="ja",
            turn_index=4,
        )

    def test_voice_agent_tool_execute_returns_structured_not_found_error(self) -> None:
        repository = Mock()
        repository.get_session.return_value = None
        phrase_card_service = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.post(
            "/voice-agent/tools/execute",
            headers={"X-Request-ID": "req-missing"},
            json={
                "session_id": "missing-session",
                "tool_name": "generate_phrase_card_preview",
                "arguments": {
                    "utterance_text": "I stayed in and made curry.",
                    "source_language": "ja",
                    "turn_index": 4,
                },
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers["X-Request-ID"], "req-missing")
        self.assertEqual(
            response.json(),
            {
                "request_id": "req-missing",
                "error": {
                    "code": "session_not_found",
                    "message": "Session not found.",
                    "details": None,
                },
            },
        )
        repository.get_session.assert_called_once_with("missing-session")
        phrase_card_service.preview_for_text.assert_not_called()

    def test_voice_agent_tool_execute_returns_structured_validation_error(self) -> None:
        repository = Mock()
        phrase_card_service = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.post(
            "/voice-agent/tools/execute",
            headers={"X-Request-ID": "req-invalid"},
            json={
                "session_id": "session-123",
                "tool_name": "generate_phrase_card_preview",
                "arguments": {
                    "utterance_text": "   ",
                    "source_language": "",
                    "turn_index": -1,
                },
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.headers["X-Request-ID"], "req-invalid")
        payload = response.json()
        self.assertEqual(payload["request_id"], "req-invalid")
        self.assertEqual(payload["error"]["code"], "invalid_request")
        self.assertEqual(payload["error"]["message"], "Request validation failed.")
        self.assertEqual(len(payload["error"]["details"]), 3)
        repository.get_session.assert_not_called()
        phrase_card_service.preview_for_text.assert_not_called()

    def test_list_phrase_cards_returns_not_found_for_missing_session(self) -> None:
        repository = Mock()
        repository.get_session.return_value = None
        phrase_card_service = Mock()
        app = create_app()
        app.dependency_overrides[get_session_repository] = lambda: repository
        app.dependency_overrides[get_phrase_card_service] = lambda: phrase_card_service
        client = TestClient(app)

        response = client.get("/sessions/missing-session/cards")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Session not found."})
        repository.get_session.assert_called_once_with("missing-session")
        phrase_card_service.list_for_session.assert_not_called()

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
