import sys
import types
import unittest
from unittest.mock import Mock, patch

from app.core.firestore import get_firestore_client
from app.repositories.sessions import SessionRepository


class FirestoreScaffoldTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_firestore_client.cache_clear()

    def test_repository_with_explicit_client_does_not_require_env(self) -> None:
        client = Mock()
        repository = SessionRepository(client=client)

        self.assertIs(repository.client, client)

    def test_get_firestore_client_raises_when_project_missing(self) -> None:
        with patch("app.core.firestore.get_settings") as mock_get_settings:
            mock_get_settings.return_value.google_cloud_project = None
            mock_get_settings.return_value.firestore_database_id = "(default)"

            with self.assertRaises(RuntimeError):
                get_firestore_client()

    def test_get_firestore_client_uses_settings_lazily(self) -> None:
        fake_client = Mock(name="firestore-client")
        fake_firestore_module = types.SimpleNamespace(Client=Mock(return_value=fake_client))
        fake_google_cloud_module = types.SimpleNamespace(firestore=fake_firestore_module)
        fake_google_module = types.SimpleNamespace(cloud=fake_google_cloud_module)

        with patch("app.core.firestore.get_settings") as mock_get_settings:
            mock_get_settings.return_value.google_cloud_project = "persona-flow-dev"
            mock_get_settings.return_value.firestore_database_id = "persona-db"

            with patch.dict(
                sys.modules,
                {
                    "google": fake_google_module,
                    "google.cloud": fake_google_cloud_module,
                    "google.cloud.firestore": fake_firestore_module,
                },
            ):
                client = get_firestore_client()

        fake_firestore_module.Client.assert_called_once_with(
            project="persona-flow-dev",
            database="persona-db",
        )
        self.assertIs(client, fake_client)

    def test_create_session_persists_document(self) -> None:
        session_ref = Mock()
        collection_ref = Mock()
        collection_ref.document.return_value = session_ref
        client = Mock()
        client.collection.return_value = collection_ref
        repository = SessionRepository(client=client)

        repository.create_session(
            "session-123",
            {
                "status": "started",
                "started_at": "2026-03-13T10:00:00+00:00",
            },
        )

        client.collection.assert_called_once_with("sessions")
        collection_ref.document.assert_called_once_with("session-123")
        session_ref.set.assert_called_once_with(
            {
                "session_id": "session-123",
                "status": "started",
                "started_at": "2026-03-13T10:00:00+00:00",
            }
        )
