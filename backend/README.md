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
```

## Available routes

- `GET /healthz`

## Firestore scaffold

The backend now includes a minimal Firestore repository scaffold for future session API work.

Collection path conventions:

- `sessions/{session_id}`
- `sessions/{session_id}/transcript_entries/{entry_id}`
- `sessions/{session_id}/phrase_cards/{card_id}`

Current scope:

- Firestore client setup is centralized in `app/core/firestore.py`
- `SessionRepository` exposes document and collection references for sessions
- transcript entry and phrase card persistence are placeholder methods only

Storage constraints:

- persist only session text metadata, transcript text entries, and phrase cards
- do not persist audio files

## Notes

- `app/api/routes/sessions.py` is intentionally a placeholder router for upcoming session endpoints.
- This scaffold does not include session CRUD business logic, Gemini integration, or authentication.
