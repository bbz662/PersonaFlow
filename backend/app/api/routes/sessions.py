from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.observability import log_observability_event
from app.repositories.sessions import SessionRepository
from app.services.phrase_cards import PhraseCardService
from app.services.session_summary import SessionSummaryService


class StartSessionRequest(BaseModel):
    source_language: str = Field(default="ja")
    target_language: str = Field(default="en")


class StartSessionResponse(BaseModel):
    session_id: str
    status: str
    started_at: str


class TranscriptEntryRequest(BaseModel):
    entry_id: str | None = None
    speaker: Literal["user", "agent"]
    text: str
    language: str
    timestamp: datetime
    turn_index: int = Field(ge=0)

    @field_validator("text", "language")
    @classmethod
    def validate_required_text_fields(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped

    @field_validator("entry_id")
    @classmethod
    def validate_entry_id(cls, value: str | None) -> str | None:
        if value is None:
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class TranscriptIngestionRequest(BaseModel):
    entries: list[TranscriptEntryRequest] = Field(min_length=1)


class TranscriptEntryResponse(BaseModel):
    entry_id: str


class TranscriptIngestionResponse(BaseModel):
    session_id: str
    stored_count: int
    entries: list[TranscriptEntryResponse]


class CompleteSessionResponse(BaseModel):
    session_id: str
    status: str
    ended_at: str
    processing_started_at: str
    completed_at: str
    card_count: int


class SessionMetadataResponse(BaseModel):
    session_id: str
    status: str
    source_language: str | None = None
    target_language: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    processing_started_at: str | None = None
    completed_at: str | None = None
    card_count: int = 0
    session_summary: str | None = None


class PhraseCardResponse(BaseModel):
    card_id: str
    source_text: str
    english_expression: str
    tone_tag: str
    usage_note: str
    created_at: str


class SessionPhraseCardsResponse(BaseModel):
    session_id: str
    card_count: int
    cards: list[PhraseCardResponse]


class PhraseCardPreviewRequest(BaseModel):
    utterance_text: str
    source_language: str = Field(default="ja")
    turn_index: int = Field(default=0, ge=0)

    @field_validator("utterance_text", "source_language")
    @classmethod
    def validate_preview_fields(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class PhraseCardPreviewResponse(BaseModel):
    tool_name: Literal["generate_phrase_card_preview"]
    summary: str
    card_count: int
    cards: list[PhraseCardResponse]


router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_session_repository() -> SessionRepository:
    return SessionRepository()


def get_phrase_card_service(
    repository: SessionRepository = Depends(get_session_repository),
) -> PhraseCardService:
    return PhraseCardService(repository=repository)


def get_session_summary_service(
    repository: SessionRepository = Depends(get_session_repository),
) -> SessionSummaryService:
    return SessionSummaryService(repository=repository)


@router.post("/start", response_model=StartSessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    payload: StartSessionRequest | None = Body(default=None),
    repository: SessionRepository = Depends(get_session_repository),
) -> StartSessionResponse:
    request = payload or StartSessionRequest()
    session_id = str(uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    session_status = "started"

    repository.create_session(
        session_id,
        {
            "user_id": "anonymous",
            "source_language": request.source_language,
            "target_language": request.target_language,
            "status": session_status,
            "started_at": started_at,
        },
    )
    log_observability_event(
        "voice.session.started",
        session_id=session_id,
        source_language=request.source_language,
        target_language=request.target_language,
    )

    return StartSessionResponse(
        session_id=session_id,
        status=session_status,
        started_at=started_at,
    )


@router.post(
    "/{session_id}/transcript",
    response_model=TranscriptIngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_transcript(
    session_id: str,
    payload: TranscriptIngestionRequest,
    repository: SessionRepository = Depends(get_session_repository),
) -> TranscriptIngestionResponse:
    stored_entries: list[TranscriptEntryResponse] = []

    for entry in payload.entries:
        entry_id = entry.entry_id or str(uuid4())
        repository.add_transcript_entry(
            session_id,
            entry_id,
            {
                "entry_id": entry_id,
                "speaker": entry.speaker,
                "text": entry.text,
                "language": entry.language,
                "timestamp": entry.timestamp.isoformat(),
                "turn_index": entry.turn_index,
            },
        )
        stored_entries.append(TranscriptEntryResponse(entry_id=entry_id))

    return TranscriptIngestionResponse(
        session_id=session_id,
        stored_count=len(stored_entries),
        entries=stored_entries,
    )


@router.post(
    "/{session_id}/complete",
    response_model=CompleteSessionResponse,
    status_code=status.HTTP_200_OK,
)
def complete_session(
    session_id: str,
    repository: SessionRepository = Depends(get_session_repository),
    phrase_card_service: PhraseCardService = Depends(get_phrase_card_service),
    session_summary_service: SessionSummaryService = Depends(get_session_summary_service),
) -> CompleteSessionResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    ended_at = datetime.now(timezone.utc).isoformat()
    processing_started_at = ended_at
    completed_at = datetime.now(timezone.utc).isoformat()

    repository.update_session(
        session_id,
        {
            "status": "processing",
            "ended_at": ended_at,
            "processing_started_at": processing_started_at,
        },
    )
    log_observability_event(
        "voice.session.stopping",
        session_id=session_id,
        status="processing",
    )

    try:
        phrase_cards = phrase_card_service.generate_for_session(session_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    session_summary = session_summary_service.generate_for_session(session_id)
    completed_payload: dict[str, object] = {
        "status": "completed",
        "completed_at": completed_at,
        "card_count": len(phrase_cards),
    }
    if session_summary:
        completed_payload["session_summary"] = session_summary

    repository.update_session(session_id, completed_payload)
    log_observability_event(
        "voice.session.completed",
        session_id=session_id,
        card_count=len(phrase_cards),
        completed_at=completed_at,
    )

    return CompleteSessionResponse(
        session_id=session_id,
        status="completed",
        ended_at=ended_at,
        processing_started_at=processing_started_at,
        completed_at=completed_at,
        card_count=len(phrase_cards),
    )


@router.get(
    "/{session_id}",
    response_model=SessionMetadataResponse,
    status_code=status.HTTP_200_OK,
)
def get_session_metadata(
    session_id: str,
    repository: SessionRepository = Depends(get_session_repository),
    session_summary_service: SessionSummaryService = Depends(get_session_summary_service),
) -> SessionMetadataResponse:
    session = repository.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    session_summary = str(session.get("session_summary", "") or "").strip() or None
    if session_summary is None and session.get("status") == "completed":
        session_summary = session_summary_service.generate_for_session(session_id)
        if session_summary:
            repository.update_session(session_id, {"session_summary": session_summary})

    return SessionMetadataResponse(
        session_id=str(session.get("session_id") or session_id),
        status=str(session.get("status") or "unknown"),
        source_language=str(session.get("source_language"))
        if session.get("source_language") is not None
        else None,
        target_language=str(session.get("target_language"))
        if session.get("target_language") is not None
        else None,
        started_at=str(session.get("started_at")) if session.get("started_at") is not None else None,
        ended_at=str(session.get("ended_at")) if session.get("ended_at") is not None else None,
        processing_started_at=str(session.get("processing_started_at"))
        if session.get("processing_started_at") is not None
        else None,
        completed_at=str(session.get("completed_at")) if session.get("completed_at") is not None else None,
        card_count=int(session.get("card_count") or 0),
        session_summary=session_summary,
    )


@router.get(
    "/{session_id}/cards",
    response_model=SessionPhraseCardsResponse,
    status_code=status.HTTP_200_OK,
)
def list_phrase_cards(
    session_id: str,
    repository: SessionRepository = Depends(get_session_repository),
    phrase_card_service: PhraseCardService = Depends(get_phrase_card_service),
) -> SessionPhraseCardsResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    cards = [
        PhraseCardResponse.model_validate(card)
        for card in phrase_card_service.list_for_session(session_id)
    ]

    return SessionPhraseCardsResponse(
        session_id=session_id,
        card_count=len(cards),
        cards=cards,
    )


@router.post(
    "/{session_id}/tools/phrase-card-preview",
    response_model=PhraseCardPreviewResponse,
    status_code=status.HTTP_200_OK,
)
def preview_phrase_cards(
    session_id: str,
    payload: PhraseCardPreviewRequest,
    repository: SessionRepository = Depends(get_session_repository),
    phrase_card_service: PhraseCardService = Depends(get_phrase_card_service),
) -> PhraseCardPreviewResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    try:
        preview_cards = phrase_card_service.preview_for_text(
            text=payload.utterance_text,
            source_language=payload.source_language,
            turn_index=payload.turn_index,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    cards = [
        PhraseCardResponse(
            card_id=f"preview-{index}",
            source_text=card["source_text"],
            english_expression=card["english_expression"],
            tone_tag=card["tone_tag"],
            usage_note=card["usage_note"],
            created_at="preview",
        )
        for index, card in enumerate(preview_cards, start=1)
    ]

    return PhraseCardPreviewResponse(
        tool_name="generate_phrase_card_preview",
        summary=f"Prepared {len(cards)} phrase card previews from the latest learner turn.",
        card_count=len(cards),
        cards=cards,
    )
