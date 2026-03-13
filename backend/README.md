# Backend

Minimal FastAPI backend scaffold for PersonaFlow.

## Requirements

- Python 3.11+
- On Ubuntu/WSL, install `python3-venv` and `python3-pip` if they are not already available

## Local run

```bash
cd backend
sudo apt install python3-venv python3-pip  # Ubuntu/WSL only, if missing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will start on `http://127.0.0.1:8000` by default.

## Environment variables

Firestore is initialized lazily. The API can boot without Firestore credentials for
local development, but repository usage requires the Firestore project settings below.

```bash
APP_NAME=PersonaFlow API
APP_ENV=development
APP_HOST=127.0.0.1
PORT=8000
GOOGLE_CLOUD_PROJECT=
FIRESTORE_DATABASE_ID=(default)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

## Available routes

- `GET /healthz`
- `POST /sessions/start`
- `POST /sessions/{session_id}/transcript`
- `POST /sessions/{session_id}/complete`
- `GET /sessions/{session_id}/cards`

## Firestore scaffold

The backend now includes a minimal Firestore repository scaffold for future session API work.

Collection path conventions:

- `sessions/{session_id}`
- `sessions/{session_id}/transcript_entries/{entry_id}`
- `sessions/{session_id}/phrase_cards/{card_id}`

Current scope:

- Firestore client setup is centralized in `app/core/firestore.py`
- `SessionRepository` exposes document and collection references for sessions
- transcript entries can be written directly to Firestore under the session subcollection
- session completion updates the session document synchronously from `processing` to `completed`
- completed sessions generate and persist 3 to 5 phrase cards synchronously

Transcript ingestion request shape:

```json
{
  "entries": [
    {
      "entry_id": "optional-client-generated-id",
      "speaker": "user",
      "text": "I really enjoyed today",
      "language": "ja",
      "timestamp": "2026-03-13T10:00:00Z",
      "turn_index": 0
    }
  ]
}
```

Notes:

- `entries` must include at least one transcript entry
- `speaker` currently supports `user` and `agent`
- `entry_id` is optional; the backend generates one when omitted

Session completion behavior:

- `ended_at` is recorded when the client ends the session
- `processing_started_at` is recorded immediately before minimal post-session work begins
- `completed_at` is recorded when the synchronous completion step finishes
- the session status moves from `processing` to `completed` in Firestore
- phrase cards are stored under `sessions/{session_id}/phrase_cards/{card_id}`
- `card_count` is written back onto the session document after generation

Phrase card response shape:

```json
{
  "session_id": "session-123",
  "card_count": 3,
  "cards": [
    {
      "card_id": "card-1",
      "source_text": "I like keeping things relaxed instead of too formal.",
      "english_expression": "I like keeping things relaxed instead of too formal.",
      "tone_tag": "casual",
      "usage_note": "Use this to describe your style in a natural way.",
      "created_at": "2026-03-13T10:10:00+00:00"
    }
  ]
}
```

Storage constraints:

- persist only session text metadata, transcript text entries, and phrase cards
- do not persist audio files

## Notes

- Gemini-backed English re-expression is attempted when `GEMINI_API_KEY` is configured; otherwise a local fallback keeps generation deterministic for development and tests.
- This scaffold does not include authentication.
