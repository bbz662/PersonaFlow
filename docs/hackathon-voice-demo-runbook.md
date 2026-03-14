# PersonaFlow Hackathon Voice Demo Runbook

## Purpose

Use this guide to get the local realtime voice demo running quickly, rehearse the main scenario, and recover fast during a live presentation.

Primary goal:
- show a voice-first learning flow that preserves personal expression
- avoid framing PersonaFlow as live translation

Primary local demo path:
- backend on `http://localhost:8000`
- frontend on `http://localhost:3000`
- `mock` audio mode for deterministic rehearsal
- `browser` audio mode only when validating microphone capture

## 1. Fast Setup Checklist

Prerequisites:
- Node.js 20+
- npm
- Python 3.11+
- Firestore-enabled Google Cloud project
- local Google credentials that Firestore can use
- optional Gemini API key for stronger phrase-card output

Recommended local credential path for Firestore:
- use Google Application Default Credentials
- if your machine is not already authenticated, run `gcloud auth application-default login`

## 2. Required Config

### Frontend

Create `frontend/.env.local`:

```bash
cd /home/bbz/Development/PersonaFlow/frontend
cp .env.local.example .env.local
```

Expected values:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_REALTIME_VOICE_ENABLED=true
NEXT_PUBLIC_REALTIME_AUDIO_MODE=mock
```

Notes:
- keep `mock` for rehearsal and live demo consistency
- switch to `browser` only when checking microphone capture

### Backend

Create `backend/.env`:

```bash
cd /home/bbz/Development/PersonaFlow/backend
cp .env.example .env
```

Minimum useful values:

```bash
APP_NAME=PersonaFlow API
APP_ENV=development
APP_HOST=0.0.0.0
PORT=8000
GOOGLE_CLOUD_PROJECT=your-project-id
FIRESTORE_DATABASE_ID=(default)
REALTIME_VOICE_ENABLED=true
```

Optional but recommended for better phrase-card generation:

```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
GEMINI_LIVE_API_KEY=
GEMINI_LIVE_MODEL=
```

Notes:
- `GOOGLE_CLOUD_PROJECT` is required for session storage because session and transcript routes write to Firestore.
- `GEMINI_API_KEY` is optional. Without it, phrase cards fall back to deterministic local generation.
- keep provider keys on the backend only.

## 3. Run Locally

### Backend

```bash
cd /home/bbz/Development/PersonaFlow/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

Quick check:

```bash
curl http://127.0.0.1:8000/healthz
```

Expected result:
- HTTP 200 from `/healthz`

### Frontend

```bash
cd /home/bbz/Development/PersonaFlow/frontend
npm install
npm run dev
```

Open:
- `http://localhost:3000/realtime`

## 4. Verify Audio And Browser Permissions

### Safe default

Use `mock` mode first:
- open `http://localhost:3000/realtime`
- confirm the page shows `Audio mode: mock`
- start the demo once to verify the end-to-end flow without microphone risk

### Microphone validation

Use browser audio only when explicitly testing capture:

```bash
cd /home/bbz/Development/PersonaFlow/frontend
sed -n '1,20p' .env.local
```

Then either:
- set `NEXT_PUBLIC_REALTIME_AUDIO_MODE=browser` and restart `npm run dev`
- or open `http://localhost:3000/realtime?audio=browser`

Browser permission check:
- click the browser lock/site settings icon
- confirm microphone access is `Allow`
- confirm the OS input device is the intended microphone
- start the realtime demo and speak one short sentence
- verify transcript activity appears instead of a permission error

If microphone permission was previously blocked:
- change site permission to `Allow`
- reload the page
- start a fresh session

## 5. Main Rehearsal Scenario

Use the same narrow story every time.

Presenter framing:
- "PersonaFlow lets the learner speak naturally first."
- "It studies the learner's own expressions after the conversation."
- "This is not real-time translation."

Recommended learner story:
- Japanese speaker describing a recent relaxed cafe conversation with a friend

Rehearsal script:
1. Open `http://localhost:3000/realtime`.
2. Confirm `Audio mode: mock` unless you are specifically validating the microphone.
3. Click `Start Realtime Demo`.
4. Let the session connect and show transcript/tool activity.
5. On the live session screen, let the single turn complete.
6. End the session once the transcript and tool result are visible.
7. Wait for the processing screen.
8. Confirm the results screen loads phrase cards.

What should be visible:
- live session connected
- user transcript captured
- phrase-card tool invoked
- assistant response returned
- processing state after ending
- results page with phrase cards

## 6. Recommended Live Demo Sequence

Use this order on stage:
1. Start on `/realtime` and give the one-sentence product framing.
2. Call out that the learner speaks naturally first, without live translation.
3. Start the demo session.
4. Let the live view show transcript + tool activity.
5. End the session before the flow drifts into extra explanation.
6. Show the results page and read one or two phrase cards out loud.
7. Close by connecting the cards back to the learner's personal tone.

Keep the live portion short:
- one compact turn is enough
- do not improvise a long conversation
- do not describe the output as sentence-by-sentence translation

## 7. Common Failure Modes

### Backend does not start

Symptoms:
- `python -m app.main` fails
- `/healthz` is unreachable

Likely causes:
- virtualenv not activated
- dependencies not installed
- port conflict
- invalid `.env`

Recovery:
1. Activate `backend/.venv`.
2. Re-run `pip install -r requirements.txt`.
3. Confirm `PORT=8000`.
4. Restart the backend.

### Session start fails from the frontend

Symptoms:
- `Unable to start the realtime demo session.`

Likely causes:
- backend not running
- `NEXT_PUBLIC_API_BASE_URL` is wrong
- Firestore config missing on backend

Recovery:
1. Check `curl http://127.0.0.1:8000/healthz`.
2. Confirm `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
3. Confirm backend `.env` includes `GOOGLE_CLOUD_PROJECT`.
4. restart backend, then retry from `/realtime`

### Firestore errors block session creation or transcript save

Symptoms:
- session start fails
- transcript save errors appear on the live screen
- results page stays empty after a completed run

Likely causes:
- `GOOGLE_CLOUD_PROJECT` missing
- local Google credentials unavailable
- wrong Firestore project/database

Recovery:
1. Confirm `GOOGLE_CLOUD_PROJECT` in `backend/.env`.
2. Confirm local Google credentials are available.
3. If needed, run `gcloud auth application-default login`.
4. Restart the backend and run the scenario again from the start.

### Microphone permission denied

Symptoms:
- browser mode does not capture audio
- permission prompt was blocked or dismissed

Recovery:
1. Change the site microphone permission to `Allow`.
2. Confirm the OS input device is correct.
3. Reload the page.
4. Start a new session.
5. If timing matters, switch back to `mock` mode and continue the demo.

### Live connection drops or stalls

Symptoms:
- reconnecting state
- disconnected state
- no new transcript/tool events

Recovery:
1. Wait for the automatic reconnect attempt.
2. If it stalls, use the page retry/start action.
3. If the state is still bad, return to `/realtime` and start a fresh session.
4. Prefer a fresh run over debugging live on stage.

### Phrase cards do not appear after ending the session

Symptoms:
- processing completes but results are empty
- results page shows a load error

Likely causes:
- transcript did not persist
- backend completion failed
- Firestore write/read issue

Recovery:
1. Start a new session instead of reusing the broken one.
2. Re-run the primary scenario in `mock` mode.
3. Make sure transcript activity appeared before ending.
4. If Gemini is failing, continue with fallback generation by leaving `GEMINI_API_KEY` unset or retrying with the same transcript flow.

## 8. Quick Recovery Playbook

Use this order under time pressure:
1. Verify backend health with `curl http://127.0.0.1:8000/healthz`.
2. Refresh `/realtime`.
3. Switch to `mock` mode if microphone or browser audio is unstable.
4. Start a fresh session instead of trying to repair the current one.
5. Keep the story to one short turn and end cleanly.

If you have less than one minute before presenting:
- use `mock` mode
- restart backend once
- refresh frontend once
- run one complete rehearsal from `/realtime` to results

## 9. Final Pre-Demo Check

Run this checklist right before the presentation:
- backend is running and `/healthz` returns 200
- frontend is running on `http://localhost:3000`
- `/realtime` opens without errors
- `Audio mode: mock` is shown unless microphone validation is intentional
- one full rehearsal reaches the results page
- presenter remembers the phrase: "not real-time translation"
