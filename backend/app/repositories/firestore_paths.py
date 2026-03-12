SESSIONS_COLLECTION = "sessions"
TRANSCRIPT_ENTRIES_SUBCOLLECTION = "transcript_entries"
PHRASE_CARDS_SUBCOLLECTION = "phrase_cards"


def session_document_path(session_id: str) -> str:
    return f"{SESSIONS_COLLECTION}/{session_id}"


def transcript_entries_collection_path(session_id: str) -> str:
    return f"{session_document_path(session_id)}/{TRANSCRIPT_ENTRIES_SUBCOLLECTION}"


def transcript_entry_document_path(session_id: str, entry_id: str) -> str:
    return f"{transcript_entries_collection_path(session_id)}/{entry_id}"


def phrase_cards_collection_path(session_id: str) -> str:
    return f"{session_document_path(session_id)}/{PHRASE_CARDS_SUBCOLLECTION}"


def phrase_card_document_path(session_id: str, card_id: str) -> str:
    return f"{phrase_cards_collection_path(session_id)}/{card_id}"
