from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.firestore import get_firestore_client
from app.repositories.firestore_paths import (
    PHRASE_CARDS_SUBCOLLECTION,
    SESSIONS_COLLECTION,
    TRANSCRIPT_ENTRIES_SUBCOLLECTION,
)


class SessionRepository:
    def __init__(self, client: Any | None = None) -> None:
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            self._client = get_firestore_client()

        return self._client

    def get_session_ref(self, session_id: str) -> Any:
        return self.client.collection(SESSIONS_COLLECTION).document(session_id)

    def build_session_doc(self, session_id: str) -> dict[str, str]:
        return {"session_id": session_id}

    def list_transcript_entries_ref(self, session_id: str) -> Any:
        return self.get_session_ref(session_id).collection(
            TRANSCRIPT_ENTRIES_SUBCOLLECTION
        )

    def list_phrase_cards_ref(self, session_id: str) -> Any:
        return self.get_session_ref(session_id).collection(PHRASE_CARDS_SUBCOLLECTION)

    def create_session(self, session_id: str, payload: dict[str, object]) -> None:
        session_doc = self.build_session_doc(session_id)
        session_doc.update(payload)
        session_doc.setdefault("started_at", datetime.now(timezone.utc).isoformat())
        self.get_session_ref(session_id).set(session_doc)

    def get_session(self, session_id: str) -> dict[str, object] | None:
        snapshot = self.get_session_ref(session_id).get()
        if not snapshot.exists:
            return None

        return snapshot.to_dict()

    def update_session(self, session_id: str, payload: dict[str, object]) -> None:
        self.get_session_ref(session_id).update(payload)

    def add_transcript_entry(
        self, session_id: str, entry_id: str, payload: dict[str, object]
    ) -> None:
        self.list_transcript_entries_ref(session_id).document(entry_id).set(payload)

    def add_phrase_card(
        self, session_id: str, card_id: str, payload: dict[str, object]
    ) -> None:
        raise NotImplementedError(
            "Phrase card persistence will be implemented in a future session issue."
        )
