from __future__ import annotations

from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Request, Response, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator

from app.api.routes.sessions import get_phrase_card_service, get_session_repository
from app.repositories.sessions import SessionRepository
from app.services.phrase_cards import PhraseCardService
from app.services.voice_agent_tools import (
    PHRASE_CARD_PREVIEW_TOOL_NAME,
    VoiceAgentPhraseCardPreviewArgs,
    VoiceAgentToolExecutionError,
    VoiceAgentToolFacade,
)

REQUEST_ID_HEADER = "X-Request-ID"


class VoiceAgentPhraseCardPreviewArguments(BaseModel):
    utterance_text: str
    source_language: str = Field(default="ja")
    turn_index: int = Field(default=0, ge=0)

    @field_validator("utterance_text", "source_language")
    @classmethod
    def validate_text_fields(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class VoiceAgentToolExecutionRequest(BaseModel):
    session_id: str
    tool_name: str
    arguments: VoiceAgentPhraseCardPreviewArguments

    @field_validator("session_id", "tool_name")
    @classmethod
    def validate_required_fields(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class VoiceAgentPhraseCardResponse(BaseModel):
    card_id: str
    source_text: str
    english_expression: str
    tone_tag: str
    usage_note: str
    created_at: str


class VoiceAgentToolExecutionResultResponse(BaseModel):
    summary: str
    card_count: int
    cards: list[VoiceAgentPhraseCardResponse]


class VoiceAgentToolExecutionResponse(BaseModel):
    request_id: str
    session_id: str
    tool_name: str
    status: str
    result: VoiceAgentToolExecutionResultResponse


class VoiceAgentErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None


class VoiceAgentErrorResponse(BaseModel):
    request_id: str
    error: VoiceAgentErrorDetail


router = APIRouter(prefix="/voice-agent", tags=["voice-agent"])


def get_voice_agent_tool_facade(
    repository: SessionRepository = Depends(get_session_repository),
    phrase_card_service: PhraseCardService = Depends(get_phrase_card_service),
) -> VoiceAgentToolFacade:
    return VoiceAgentToolFacade(repository=repository, phrase_card_service=phrase_card_service)


def _resolve_request_id(value: str | None) -> str:
    stripped = (value or "").strip()
    return stripped or str(uuid4())


def set_request_id_header(response: Response, request_id: str) -> None:
    response.headers[REQUEST_ID_HEADER] = request_id


def build_voice_agent_error_response(
    *,
    request_id: str,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
) -> VoiceAgentErrorResponse:
    return VoiceAgentErrorResponse(
        request_id=request_id,
        error=VoiceAgentErrorDetail(code=code, message=message, details=details),
    )


async def handle_voice_agent_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> Response | None:
    if not request.url.path.startswith("/voice-agent/"):
        return None

    request_id = _resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
    response = Response(
        content=build_voice_agent_error_response(
            request_id=request_id,
            code="invalid_request",
            message="Request validation failed.",
            details=exc.errors(),
        ).model_dump_json(),
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        media_type="application/json",
    )
    set_request_id_header(response, request_id)
    return response


@router.post(
    "/tools/execute",
    response_model=VoiceAgentToolExecutionResponse,
    responses={
        400: {"model": VoiceAgentErrorResponse},
        404: {"model": VoiceAgentErrorResponse},
        422: {"model": VoiceAgentErrorResponse},
    },
    status_code=status.HTTP_200_OK,
)
def execute_tool(
    payload: VoiceAgentToolExecutionRequest,
    response: Response,
    facade: VoiceAgentToolFacade = Depends(get_voice_agent_tool_facade),
    x_request_id: Annotated[str | None, Header(alias=REQUEST_ID_HEADER)] = None,
) -> VoiceAgentToolExecutionResponse:
    request_id = _resolve_request_id(x_request_id)
    set_request_id_header(response, request_id)

    if payload.tool_name != PHRASE_CARD_PREVIEW_TOOL_NAME:
        raise VoiceAgentToolExecutionError(
            status_code=400,
            code="unsupported_tool",
            message=f"Unsupported tool request: {payload.tool_name}.",
            request_id=request_id,
        )

    result = facade.execute_phrase_card_preview(
        request_id=request_id,
        session_id=payload.session_id,
        arguments=VoiceAgentPhraseCardPreviewArgs(
            utterance_text=payload.arguments.utterance_text,
            source_language=payload.arguments.source_language,
            turn_index=payload.arguments.turn_index,
        ),
    )

    return VoiceAgentToolExecutionResponse(
        request_id=result.request_id,
        session_id=result.session_id,
        tool_name=result.tool_name,
        status="completed",
        result=VoiceAgentToolExecutionResultResponse(
            summary=result.summary,
            card_count=result.card_count,
            cards=[
                VoiceAgentPhraseCardResponse.model_validate(card)
                for card in result.cards
            ],
        ),
    )
