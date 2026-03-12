import unittest

from app.repositories.firestore_paths import (
    phrase_card_document_path,
    phrase_cards_collection_path,
    session_document_path,
    transcript_entries_collection_path,
    transcript_entry_document_path,
)


class FirestorePathTests(unittest.TestCase):
    def test_session_document_path(self) -> None:
        self.assertEqual(session_document_path("session-123"), "sessions/session-123")

    def test_transcript_paths(self) -> None:
        self.assertEqual(
            transcript_entries_collection_path("session-123"),
            "sessions/session-123/transcript_entries",
        )
        self.assertEqual(
            transcript_entry_document_path("session-123", "entry-1"),
            "sessions/session-123/transcript_entries/entry-1",
        )

    def test_phrase_card_paths(self) -> None:
        self.assertEqual(
            phrase_cards_collection_path("session-123"),
            "sessions/session-123/phrase_cards",
        )
        self.assertEqual(
            phrase_card_document_path("session-123", "card-1"),
            "sessions/session-123/phrase_cards/card-1",
        )
