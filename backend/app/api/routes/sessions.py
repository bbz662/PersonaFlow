from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.repositories.sessions import SessionRepository


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


router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_session_repository() -> SessionRepository:
    return SessionRepository()


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
    repository.update_session(
        session_id,
        {
            "status": "completed",
            "completed_at": completed_at,
        },
    )

    return CompleteSessionResponse(
        session_id=session_id,
        status="completed",
        ended_at=ended_at,
        processing_started_at=processing_started_at,
        completed_at=completed_at,
    )
