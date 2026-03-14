# PersonaFlow

PersonaFlow is a voice-first language-learning agent that helps learners build an English voice that still feels like themselves.

Instead of translating sentence by sentence, PersonaFlow encourages natural casual conversation in the learner's native language, then turns the most reusable and personal moments into English phrase cards for later review. The goal is not textbook correctness alone, but preserving tone, personality, and self-expression across languages.

## Why PersonaFlow?

Many language-learning tools help people produce correct sentences, but not necessarily sentences that feel personal.

PersonaFlow focuses on a different problem:

- learners want to sound like themselves in English
- learners want to study phrases they would actually use
- learners do not want constant correction during conversation
- learners benefit from reviewing their own expressions after speaking naturally

PersonaFlow is designed around self-expression preservation, not real-time translation.

## MVP Scope

The current MVP focuses on a simple end-to-end flow:

1. start a voice session
2. have a natural casual conversation in the user's native language
3. save the session transcript
4. generate 3-5 personalized English phrase cards after the session
5. review those cards in a lightweight results screen

### In scope

- voice-first conversation flow
- casual small-talk interaction
- transcript-based post-session processing
- personalized English phrase card generation
- minimal web UI
- deployment on Google Cloud

### Out of scope for the MVP

- authentication
- multi-user account system
- real-time translation UI
- grammar correction during conversation
- pronunciation scoring
- flashcard export
- long-term spaced repetition system
- audio file persistence
- advanced multi-session memory

## Product Principles

- Conversation first: the user should stay focused on speaking
- Post-session learning: learning artifacts are generated after the conversation
- Personal over generic: prioritize phrases that reflect the learner's own style
- Not a translation app: avoid turning the experience into literal sentence conversion
- Minimal UI friction: voice-driven interaction with lightweight controls

## Planned Architecture

### Frontend
- Next.js
- TypeScript

### Backend
- FastAPI
- Python

### AI
- Gemini Live API
- Google GenAI SDK

### Data
- Firestore

### Hosting
- Google Cloud Run

## Planned Data Model

### Session
Stores high-level session metadata.

Example fields:
- `session_id`
- `user_id` (anonymous for MVP)
- `source_language`
- `target_language`
- `status`
- `started_at`
- `ended_at`
- `session_summary`
- `card_count`

### Transcript Entries
Stores user and agent utterances for each session.

Example fields:
- `entry_id`
- `speaker`
- `text`
- `language`
- `timestamp`
- `turn_index`

### Phrase Cards
Stores post-session learning artifacts.

Example fields:
- `card_id`
- `source_text`
- `english_expression`
- `tone_tag`
- `usage_note`
- `created_at`

## Repository Structure

This repository uses a simple two-app structure:

```text
PersonaFlow/
|-- frontend/      # Next.js app scaffold lives here
|-- backend/       # FastAPI app scaffold lives here
|-- README.md
|-- AGENTS.md
`-- .env.example
```

The repository scaffold intentionally stays light at this stage so upcoming frontend and backend setup issues can work independently inside their own directories.

## Development Status

PersonaFlow is currently being developed as an MVP for a hackathon.

At this stage, the focus is on:

- establishing the repository scaffold
- building the core session flow
- connecting live conversation
- generating post-session phrase cards
- preparing a working demo

## Local Development

This section stays lightweight on purpose, but the repository now includes explicit
configuration scaffolding for the optional realtime voice path.

### Expected prerequisites

- Node.js
- Python 3.11+
- Google Cloud project
- Firestore enabled
- access to Gemini API / Live API
- environment variables configured

### Planned setup

#### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

#### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Environment Variables

The exact variables may evolve, but the project is expected to require configuration similar to:

```bash
# Frontend
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_REALTIME_VOICE_ENABLED=true
NEXT_PUBLIC_REALTIME_AUDIO_MODE=mock

# Backend
GOOGLE_CLOUD_PROJECT=
FIRESTORE_DATABASE_ID=
GEMINI_API_KEY=
GEMINI_LIVE_API_KEY=
GEMINI_MODEL=
GEMINI_LIVE_MODEL=
REALTIME_VOICE_ENABLED=true
PORT=
```

Use local uncommitted env files for development and a secure secret management
strategy for deployment. Copy from the committed examples and fill in only the values
needed by the app you are actively working on.

### Realtime voice toggle

- `NEXT_PUBLIC_REALTIME_VOICE_ENABLED` controls whether the frontend exposes the
  `/realtime` path and related UI entry points.
- `REALTIME_VOICE_ENABLED` controls whether the backend accepts websocket
  connections on `WS /sessions/{session_id}/live`.
- Both flags default to `true` in the sample files to preserve the current demo
  behavior, but either side can be turned off without invasive code changes.

### Local development assumptions

- `NEXT_PUBLIC_REALTIME_AUDIO_MODE=mock` is the safe default for the current hackathon
  demo flow.
- Browser microphone validation is opt-in via `NEXT_PUBLIC_REALTIME_AUDIO_MODE=browser`.
- Gemini secrets stay on the backend only. The frontend should never receive provider
  keys via `NEXT_PUBLIC_*` variables.

### Future production assumptions

- Keep provider credentials in Cloud Run environment variables or Secret Manager.
- Prefer a dedicated `GEMINI_LIVE_API_KEY` only if the realtime voice path needs a
  separate provider secret; otherwise `GEMINI_API_KEY` can remain the single backend
  secret.
- Disable realtime voice in deployments where the provider wiring is incomplete by
  setting `REALTIME_VOICE_ENABLED=false`.

## Safety and Privacy Notes

For the MVP:

- audio files should not be persisted
- only text transcript and generated phrase cards should be stored
- sensitive personal content should be avoided in generated cards when possible
- secrets must never be committed to the repository

## Contribution and Workflow

Development is currently organized issue-by-issue.

General workflow:

1. pick a single scoped issue
2. implement a focused change
3. open a small PR
4. review for MVP scope alignment
5. merge and move to the next issue

Please keep changes minimal and avoid adding features outside the current issue.

## Hackathon Context

PersonaFlow is being built as a live conversational language-learning MVP for a hackathon setting. The priority is a clear, working end-to-end demo over architectural completeness.

## Vision

Longer term, PersonaFlow aims to become a self-expression coach for second-language learners:

- not just helping users say things correctly
- but helping them say things in a way that still feels genuinely their own

## Elevator Pitch

PersonaFlow helps learners build an English voice that still feels like themselves by turning casual native-language conversations into personalized phrases and flashcards.



