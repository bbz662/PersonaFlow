# Frontend

PersonaFlow's frontend is a minimal Next.js + TypeScript app for the MVP landing page and upcoming voice session flow.

## What is included

- Next.js App Router scaffold
- global layout and metadata
- single landing page with PersonaFlow branding
- landing page plus current session-start entry point
- lightweight CSS styling with no extra UI framework

## Local development

Prerequisite:
- Node.js 20+ and npm

Environment:
- copy `frontend/.env.local.example` to `frontend/.env.local`
- set `NEXT_PUBLIC_API_BASE_URL` if the backend is not running on `http://localhost:8000`
- leave `NEXT_PUBLIC_REALTIME_AUDIO_MODE=mock` for the current deterministic demo, or set it to `browser` when validating microphone capture locally
- set `NEXT_PUBLIC_REALTIME_VOICE_ENABLED=false` to hide the realtime demo route without changing code

Run locally:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- The main session flow uses `NEXT_PUBLIC_API_BASE_URL` for backend requests.
- Realtime voice config stays frontend-safe: only non-secret `NEXT_PUBLIC_*` flags belong in `frontend/.env.local`.
- Provider secrets such as Gemini keys must stay on the backend and must not be exposed to the browser bundle.
- The Start Session button calls the backend start-session endpoint and routes into the current session flow.
- Session, microphone, and results flows should be added in follow-up issues.


