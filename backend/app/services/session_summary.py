from __future__ import annotations

from typing import Any

from app.repositories.sessions import SessionRepository


class SessionSummaryService:
    def __init__(self, repository: SessionRepository) -> None:
        self._repository = repository

    def generate_for_session(self, session_id: str) -> str | None:
        session = self._repository.get_session(session_id) or {}
        existing_summary = self._clean_text(str(session.get("session_summary", "") or ""))
        if existing_summary:
            return existing_summary

        transcript_entries = self._repository.list_transcript_entries(session_id)
        phrase_cards = self._repository.list_phrase_cards(session_id)
        return self._build_summary(transcript_entries, phrase_cards)

    def _build_summary(
        self,
        transcript_entries: list[dict[str, Any]],
        phrase_cards: list[dict[str, Any]],
    ) -> str | None:
        user_moments = [
            self._clean_text(str(entry.get("text", "")))
            for entry in transcript_entries
            if entry.get("speaker") == "user"
        ]
        user_moments = [moment for moment in user_moments if moment]

        if not user_moments:
            return None

        tone_tags = self._unique_values(
            self._clean_text(str(card.get("tone_tag", ""))) for card in phrase_cards
        )
        summary_parts = [
            f"This session captured {self._build_moment_count_phrase(user_moments, phrase_cards)}."
        ]

        if tone_tags:
            summary_parts.append(
                f"The strongest phrase cards leaned {self._join_with_and(tone_tags[:2])}."
            )

        highlights = [self._truncate(moment) for moment in user_moments[:2]]
        if highlights:
            summary_parts.append(
                "It centered on moments like "
                + self._join_with_and([f'\"{highlight}\"' for highlight in highlights])
                + "."
            )

        return " ".join(summary_parts)

    def _build_moment_count_phrase(
        self,
        user_moments: list[str],
        phrase_cards: list[dict[str, Any]],
    ) -> str:
        if phrase_cards:
            return f"{len(phrase_cards)} reusable phrase card moments from your conversation"

        return f"{min(len(user_moments), 3)} personal moments from your conversation"

    def _clean_text(self, value: str) -> str:
        return " ".join(value.split()).strip()

    def _truncate(self, value: str, limit: int = 96) -> str:
        cleaned = self._clean_text(value)
        if len(cleaned) <= limit:
            return cleaned

        return cleaned[: limit - 3].rstrip() + "..."

    def _unique_values(self, values: Any) -> list[str]:
        seen: set[str] = set()
        unique_values: list[str] = []
        for value in values:
            if not value:
                continue
            normalized = value.casefold()
            if normalized in seen:
                continue
            seen.add(normalized)
            unique_values.append(value)
        return unique_values

    def _join_with_and(self, values: list[str]) -> str:
        if not values:
            return ""
        if len(values) == 1:
            return values[0]
        if len(values) == 2:
            return " and ".join(values)
        return ", ".join(values[:-1]) + f", and {values[-1]}"
