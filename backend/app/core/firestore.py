from functools import lru_cache
from typing import Any

from app.core.config import get_settings


@lru_cache
def get_firestore_client() -> Any:
    settings = get_settings()

    if not settings.google_cloud_project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT must be set before using Firestore repositories."
        )

    from google.cloud import firestore

    return firestore.Client(
        project=settings.google_cloud_project,
        database=settings.firestore_database_id,
    )
