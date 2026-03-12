from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, status
from pydantic import BaseModel, Field

from app.repositories.sessions import SessionRepository


class StartSessionRequest(BaseModel):
    source_language: str = Field(default="ja")
    target_language: str = Field(default="en")


class StartSessionResponse(BaseModel):
    session_id: str
    status: str
    started_at: str


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
