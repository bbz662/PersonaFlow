import unittest
from unittest.mock import Mock

from app.services.phrase_cards import PhraseCardService


class PhraseCardServiceTests(unittest.TestCase):
    def test_generate_for_session_creates_three_cards_from_user_transcript(self) -> None:
        repository = Mock()
        repository.list_phrase_cards.return_value = []
        repository.list_transcript_entries.return_value = [
            {
                "entry_id": "entry-1",
                "speaker": "user",
                "text": "  I always need a little time to warm up in new groups.  ",
                "language": "en",
                "timestamp": "2026-03-13T10:00:00+00:00",
                "turn_index": 0,
            },
            {
                "entry_id": "entry-2",
                "speaker": "agent",
                "text": "That makes sense.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:05+00:00",
                "turn_index": 1,
            },
            {
                "entry_id": "entry-3",
                "speaker": "user",
                "text": "Once I get comfortable, I talk a lot more.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:10+00:00",
                "turn_index": 2,
            },
            {
                "entry_id": "entry-4",
                "speaker": "user",
                "text": "I like keeping things relaxed instead of too formal.",
                "language": "en",
                "timestamp": "2026-03-13T10:00:15+00:00",
                "turn_index": 3,
            },
        ]

        cards = PhraseCardService(repository=repository).generate_for_session("session-123")

        self.assertEqual(len(cards), 3)
        self.assertEqual(repository.add_phrase_card.call_count, 3)
        self.assertEqual(
            cards[0]["source_text"],
            "I always need a little time to warm up in new groups.",
        )
        self.assertEqual(
            cards[0]["english_expression"],
            "I always need a little time to warm up in new groups.",
        )
        self.assertTrue(cards[0]["card_id"])
        self.assertTrue(cards[0]["created_at"])

    def test_generate_for_session_returns_existing_cards_without_regenerating(self) -> None:
        repository = Mock()
        repository.list_phrase_cards.return_value = [
            {
                "card_id": "card-1",
                "source_text": "I like keeping things relaxed instead of too formal.",
                "english_expression": "I like keeping things relaxed instead of too formal.",
                "tone_tag": "casual",
                "usage_note": "Use this to describe your style in a natural way.",
                "created_at": "2026-03-13T10:00:00+00:00",
            }
        ]

        cards = PhraseCardService(repository=repository).generate_for_session("session-123")

        self.assertEqual(len(cards), 1)
        repository.list_transcript_entries.assert_not_called()
        repository.add_phrase_card.assert_not_called()

    def test_generate_for_session_requires_user_transcript_entries(self) -> None:
        repository = Mock()
        repository.list_phrase_cards.return_value = []
        repository.list_transcript_entries.return_value = [
            {
                "entry_id": "entry-1",
                "speaker": "agent",
                "text": "Hello there",
                "language": "en",
                "timestamp": "2026-03-13T10:00:00+00:00",
                "turn_index": 0,
            }
        ]

        with self.assertRaisesRegex(
            ValueError, "At least one user transcript entry is required"
        ):
            PhraseCardService(repository=repository).generate_for_session("session-123")
