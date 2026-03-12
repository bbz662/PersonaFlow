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

All variables are optional for local development.

```bash
APP_NAME=PersonaFlow API
APP_ENV=development
APP_HOST=127.0.0.1
PORT=8000
```

## Available routes

- `GET /healthz`

## Notes

- `app/api/routes/sessions.py` is intentionally a placeholder router for upcoming session endpoints.
- This scaffold does not include Firestore, Gemini, authentication, or session business logic.
