from functools import lru_cache
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    app_host: str
    port: int
    google_cloud_project: str | None
    firestore_database_id: str
    gemini_api_key: str | None
    gemini_model: str

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    port = os.getenv("PORT", "8000")

    return Settings(
        app_name=os.getenv("APP_NAME", "PersonaFlow API"),
        app_env=os.getenv("APP_ENV", "development"),
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        port=int(port),
        google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT") or None,
        firestore_database_id=os.getenv("FIRESTORE_DATABASE_ID") or "(default)",
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
    )

