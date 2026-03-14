from fastapi import FastAPI
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.api.router import api_router
from app.api.routes.voice_agent import (
    build_voice_agent_error_response,
    handle_voice_agent_validation_error,
    set_request_id_header,
)
from app.core.config import get_settings
from app.services.voice_agent_tools import VoiceAgentToolExecutionError


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.exception_handler(VoiceAgentToolExecutionError)
    async def handle_voice_agent_tool_error(_, exc: VoiceAgentToolExecutionError) -> JSONResponse:
        response = JSONResponse(
            status_code=exc.status_code,
            content=build_voice_agent_error_response(
                request_id=exc.request_id,
                code=exc.code,
                message=exc.message,
            ).model_dump(),
        )
        set_request_id_header(response, exc.request_id)
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(request, exc: RequestValidationError):
        voice_agent_response = await handle_voice_agent_validation_error(request, exc)
        if voice_agent_response is not None:
            return voice_agent_response
        return await request_validation_exception_handler(request, exc)

    return app


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.port,
        reload=settings.is_development,
    )
