# Realtime Voice Architecture

## Purpose

This document defines the target architecture for adding a realtime voice UX layer to PersonaFlow without changing the existing domain logic boundaries.

The goal is a hackathon-practical structure that supports:

- a live voice conversation loop
- transcript capture for the existing session flow
- post-session phrase card generation through the current backend domain facade

The goal is not to turn PersonaFlow into a realtime translation app. Live voice should support natural conversation and lightweight agent guidance, while learning artifacts remain a post-session step.

## Design principles

- Keep the existing backend session and phrase-card flow as the source of truth for domain behavior.
- Add the realtime voice layer as a thin integration layer, not a system redesign.
- Separate browser audio concerns from session orchestration concerns.
- Keep provider-specific Gemini Live logic behind a single client boundary.
- Persist only text transcript entries and generated phrase cards.
- Prefer finalized turns and explicit session events over logging raw audio or partial noisy data.

## Target layering

```text
+---------------------------------------------------------------+
| Frontend UI                                                   |
| session screen, status, transcript feed, controls, errors     |
+-----------------------------+---------------------------------+
                              |
                              v
+---------------------------------------------------------------+
| Voice Session Controller                                      |
| session state, turn lifecycle, retries, event routing         |
+-------------+----------------------+--------------------------+
              |                      |
              v                      v
+--------------------------+   +--------------------------------+
| Audio I/O Adapter        |   | Gemini Live Client             |
| mic capture, playback,   |   | provider connection,           |
| browser audio events     |   | provider event mapping         |
+--------------------------+   +---------------+----------------+
                                              |
                                              v
                                   +---------------------------+
                                   | Tool / Function Bridge    |
                                   | app-level tool handlers   |
                                   +-------------+-------------+
                                                 |
                                                 v
                                   +---------------------------+
                                   | Backend Facade            |
                                   | /sessions, /live token,   |
                                   | transcript + completion   |
                                   +-------------+-------------+
                                                 |
                                                 v
                                   +---------------------------+
                                   | PersonaFlow Domain Logic  |
                                   | repositories, summary,    |
                                   | phrase cards              |
                                   +---------------------------+
```

## High-level flow

1. The frontend UI starts a PersonaFlow session through the existing backend session facade.
2. The voice session controller opens the realtime provider connection through the Gemini Live client.
3. The audio adapter handles microphone input and speaker playback only.
4. The Gemini Live client emits normalized events to the voice session controller.
5. The controller updates UI state, appends transcript-ready text events, and routes provider tool calls to the tool/function bridge.
6. The tool/function bridge calls backend facade endpoints for app-owned actions.
7. The backend facade persists transcript text and runs the existing post-session completion flow.

## Boundary definitions

### 1. Frontend/UI responsibilities

The UI layer owns presentation only:

- start and end controls
- connection and recording indicators
- live event feed and readable transcript feed
- lightweight recovery actions such as retry or reconnect
- transition to the existing results screen

The UI should not:

- talk to Gemini Live directly
- implement provider protocol details
- decide when transcript entries are persisted
- call repositories or domain services

Recommended placement:

- route components under `frontend/app/session/[sessionId]/...`
- view-focused components only
- no provider-specific logic outside the voice session controller path

### 2. Voice session state management boundary

The voice session controller is the application-level orchestration boundary for the live conversation.

It should own:

- session lifecycle states such as `idle`, `connecting`, `live`, `ending`, `processing`, `failed`
- normalized event handling from audio, provider, and backend
- turn commit rules for transcript persistence
- reconnect and shutdown behavior
- mapping of low-level failures into user-facing session errors

It should not own:

- raw microphone APIs
- Gemini transport details
- backend business logic

This layer is the correct place for a small explicit state machine or reducer. For the MVP, keep it local to the live session feature rather than introducing global state infrastructure.

### 3. Audio I/O abstraction boundary

The audio I/O adapter isolates browser audio APIs from the rest of the app.

It should own:

- microphone permission and capture lifecycle
- audio chunk or stream handoff to the provider client
- playback of provider audio responses
- mute, stop, and cleanup behavior
- browser-specific media errors

It should not own:

- transcript persistence
- session timing rules
- provider tool calls
- domain concepts such as phrase cards or summaries

This keeps future browser audio changes localized and prevents Web Audio details from leaking into UI components.

### 4. Gemini Live provider client boundary

The Gemini Live client is the only layer that knows Gemini Live protocol details.

It should own:

- provider session connection setup
- auth or ephemeral token usage if needed later
- provider event parsing
- provider audio/text message encoding and decoding
- mapping provider events into app-level normalized events

It should not own:

- UI state
- backend route calling
- direct Firestore writes
- PersonaFlow-specific transcript or phrase-card rules

For hackathon scope, the client can be implemented as a thin wrapper around the provider SDK or transport. The important boundary is that provider-specific code remains isolated.

### 5. Tool/function bridge boundary

The tool/function bridge is the boundary between provider-initiated actions and app-owned behavior.

It should own:

- registering the app tools/functions exposed to the live model
- validating tool input and output payloads
- mapping provider tool requests into backend facade calls
- returning compact tool results back to the provider client

It should not own:

- session UI rendering
- provider connection management
- direct domain repository access

Examples of valid bridge actions:

- commit finalized transcript turns
- fetch current session metadata
- request end-of-session processing

Examples of invalid bridge actions:

- realtime translation of every user utterance
- direct phrase-card generation in the browser
- bypassing backend validation and calling repositories directly

### 6. Backend facade boundary for PersonaFlow domain logic

The backend remains the only facade for PersonaFlow domain logic.

Current backend responsibilities already include:

- session creation
- transcript ingestion
- session completion
- phrase-card generation
- session summary generation

The realtime voice layer should treat backend routes as the stable application boundary. The voice stack may add a minimal live-support endpoint later, such as a provider session bootstrap or ephemeral token route, but it should not move existing domain logic into the frontend or provider layer.

Current relevant backend seams:

- `POST /sessions/start`
- `POST /sessions/{session_id}/transcript`
- `POST /sessions/{session_id}/complete`
- `GET /sessions/{session_id}`
- `GET /sessions/{session_id}/cards`
- current websocket transport at `/sessions/{session_id}/live`

Recommended rule:

- all persistence and post-session processing stays behind backend APIs
- the live layer may call backend APIs frequently, but never bypass them

### 7. Error propagation model

Errors should propagate upward in a normalized way.

```text
Browser / audio error
  -> Audio adapter error event
  -> Voice session controller
  -> UI state + user-safe message

Provider protocol / connection error
  -> Gemini Live client error event
  -> Voice session controller
  -> reconnect or fail state
  -> UI message

Backend validation / persistence error
  -> Tool bridge or direct frontend API caller
  -> Voice session controller
  -> session-level error banner or end-session failure state
```

Rules:

- low-level layers emit structured errors, not UI strings only
- the controller converts them into a small set of user-facing categories
- the UI shows actionable but minimal copy
- backend error payloads should not expose secrets or raw transcript dumps in logs

Suggested categories:

- `permission_denied`
- `device_unavailable`
- `provider_unavailable`
- `transport_failed`
- `backend_rejected`
- `session_not_found`
- `unknown`

### 8. Observability and logging touchpoints

Observability should focus on session lifecycle and integration failures, not raw conversational content.

Recommended touchpoints:

- frontend: session start, provider connect, provider disconnect, reconnect attempt, session end request, results navigation
- audio adapter: permission denied, capture start failure, playback failure
- Gemini Live client: connect success/failure, provider event type counts, unexpected provider payloads
- tool bridge: tool call started, tool call succeeded, tool call failed, backend latency
- backend facade: transcript batch accepted, session completion started, session completion succeeded, phrase-card generation failed

Logging rules:

- do not log raw audio
- avoid logging full transcript text by default
- prefer session id, turn index, event type, latency, and error code
- if text must be logged during development, keep it behind explicit debug mode and avoid sensitive content

## Integration boundaries by ownership

```text
Frontend-owned:
- UI rendering
- voice session controller
- audio adapter
- Gemini Live client wrapper
- tool/function bridge

Backend-owned:
- session record lifecycle
- transcript persistence
- session summary generation
- phrase-card generation
- Firestore access

Shared contract:
- session ids
- transcript entry schema
- normalized live event schema
- tool payload schema
- error code schema
```

## Migration path

The migration should be incremental and preserve the current session flow.

### Phase 0: Keep current scaffold as the baseline

Use the current structure as the starting point:

- frontend live session page renders connection state and event feed
- `frontend/lib/live-session-transport.ts` provides a thin transport abstraction
- backend `/sessions/*` routes already own persistence and completion
- backend websocket route can remain a placeholder transport seam

No domain changes are required in this phase.

### Phase 1: Introduce a voice session controller in the frontend

Refactor live-session page logic into a dedicated controller module that:

- owns session state transitions
- receives normalized transport events
- exposes a UI-friendly API to the page

This is mostly a frontend internal cleanup and should not change backend behavior.

### Phase 2: Split transport concerns into audio and provider boundaries

Evolve the current live transport seam into two explicit adapters:

- `AudioIOAdapter`
- `GeminiLiveClient`

The current `LiveSessionTransport` can either become the Gemini client wrapper or the top-level controller dependency. Keep the rename or refactor localized.

### Phase 3: Add the tool/function bridge

Introduce an app-owned tool bridge that converts provider tool calls into backend facade requests.

Start with a narrow set of actions:

- append finalized transcript entries
- fetch session metadata if needed
- end session and trigger current completion flow

Avoid broad tool surfaces during the hackathon.

### Phase 4: Keep transcript persistence aligned with current backend contract

Persist only finalized or explicitly committed turns through `POST /sessions/{session_id}/transcript`.

Do not:

- persist raw audio
- persist every partial provider hypothesis
- shift phrase-card generation into the live layer

### Phase 5: Add minimal live bootstrap support only if required

If Gemini Live integration needs backend-issued bootstrap data, add a small backend endpoint for that purpose only.

Examples:

- ephemeral provider token
- provider session configuration

This endpoint should remain separate from the core session domain routes and should not absorb transcript or phrase-card logic.

### Phase 6: Harden error handling and observability

After the live path works end-to-end:

- standardize error codes across frontend and backend boundaries
- add session-level metrics and logs
- keep logs content-light and privacy-safe

## Non-goals

This target architecture does not include:

- realtime translation UI
- sentence-by-sentence correction workflow
- audio file persistence
- new infrastructure beyond minimal live integration support
- a full event-sourcing redesign
- moving phrase-card generation into the browser or provider layer

## Follow-up issue guidance

Future issues can be scoped cleanly around these boundaries:

- frontend voice session controller extraction
- browser audio adapter implementation
- Gemini Live client wrapper
- tool/function bridge for transcript commit and session end
- minimal backend live bootstrap endpoint if required
- observability pass for live session lifecycle

Each of those changes can remain focused while preserving the current PersonaFlow domain logic.
