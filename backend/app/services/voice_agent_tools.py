from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.repositories.sessions import SessionRepository
from app.services.phrase_cards import PhraseCardService

PHRASE_CARD_PREVIEW_TOOL_NAME = "generate_phrase_card_preview"


@dataclass(frozen=True)
class VoiceAgentPhraseCardPreviewArgs:
    utterance_text: str
    source_language: str
    turn_index: int


@dataclass(frozen=True)
class VoiceAgentToolExecutionResult:
    request_id: str
    session_id: str
    tool_name: Literal["generate_phrase_card_preview"]
    summary: str
    card_count: int
    cards: list[dict[str, str]]


class VoiceAgentToolExecutionError(Exception):
    def __init__(self, *, status_code: int, code: str, message: str, request_id: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.request_id = request_id


class VoiceAgentToolFacade:
    def __init__(
        self,
        repository: SessionRepository,
        phrase_card_service: PhraseCardService,
    ) -> None:
        self._repository = repository
        self._phrase_card_service = phrase_card_service

    def execute_phrase_card_preview(
        self,
        *,
        request_id: str,
        session_id: str,
        arguments: VoiceAgentPhraseCardPreviewArgs,
    ) -> VoiceAgentToolExecutionResult:
        if self._repository.get_session(session_id) is None:
            raise VoiceAgentToolExecutionError(
                status_code=404,
                code="session_not_found",
                message="Session not found.",
                request_id=request_id,
            )

        try:
            preview_cards = self._phrase_card_service.preview_for_text(
                text=arguments.utterance_text,
                source_language=arguments.source_language,
                turn_index=arguments.turn_index,
            )
        except ValueError as exc:
            raise VoiceAgentToolExecutionError(
                status_code=422,
                code="tool_execution_failed",
                message=str(exc),
                request_id=request_id,
            ) from exc

        cards = [
            {
                "card_id": f"preview-{index}",
                "source_text": card["source_text"],
                "english_expression": card["english_expression"],
                "tone_tag": card["tone_tag"],
                "usage_note": card["usage_note"],
                "created_at": "preview",
            }
            for index, card in enumerate(preview_cards, start=1)
        ]

        return VoiceAgentToolExecutionResult(
            request_id=request_id,
            session_id=session_id,
            tool_name=PHRASE_CARD_PREVIEW_TOOL_NAME,
            summary=f"Prepared {len(cards)} phrase card previews from the latest learner turn.",
            card_count=len(cards),
            cards=cards,
        )
