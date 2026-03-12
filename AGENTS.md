# AGENTS.md

## Project
PersonaFlow is a voice-first MVP for language learners who want to preserve their personal tone and self-expression in English.

## Product constraints
- This is an MVP for a hackathon.
- Prioritize a working end-to-end demo over architectural perfection.
- Do not turn the product into a translation app.
- Do not add features outside the current issue scope.

## Engineering constraints
- Keep changes minimal and localized.
- Prefer simple, explicit code over abstraction-heavy designs.
- Do not introduce new infrastructure unless the issue requires it.
- Do not add authentication, billing, or multi-user systems.
- Do not persist audio files.
- Store only text transcript and generated phrase cards.

## Stack
- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- Data: Firestore
- Hosting: Cloud Run
- AI: Gemini Live API + Google GenAI SDK

## Workflow
- One issue = one focused PR.
- Include a short implementation summary in the PR description.
- Include setup/run notes when new files or env vars are introduced.
- Call out trade-offs explicitly.

## Review guidelines
- Flag unnecessary complexity.
- Flag features that drift from MVP scope.
- Flag anything that makes the product feel like a real-time translation app.
- Flag code that could leak sensitive transcript data in logs.
