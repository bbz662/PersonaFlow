# Hackathon Realtime Voice UX Specification

## 1. Problem statement

PersonaFlow already defines the core product value: help language learners preserve their personal tone and self-expression in English through voice-led conversation and post-session phrase cards. For the hackathon, the missing layer is a clear realtime voice UX that makes this value legible in a short live demo.

The problem this spec solves is not "how to build realtime translation." It is how to present PersonaFlow as a responsive voice experience where the user can speak naturally, stay focused on conversation, and quickly reach a visible learning outcome.

## 2. Target user

The target user is a language learner who:

- is more comfortable starting in their native language
- wants English expressions that still feel personal, casual, and reusable
- does not want constant interruption, correction, or literal translation while speaking
- benefits from a lightweight guided conversation that ends in concrete study material

For the hackathon demo, assume a first-time user with no setup friction and a short attention span.

## 3. Core product value vs hackathon UX value

### Core PersonaFlow value

- natural voice conversation comes first
- the user speaks freely without sentence-by-sentence correction
- learning happens after the conversation through personalized English phrase cards
- the product helps the learner sound like themselves, not just sound correct

### Hackathon UX value

- the product feels live, responsive, and easy to understand within seconds
- the UI makes the conversation state obvious at all times
- the path from speaking to learning artifact is visible in one short session
- the demo highlights "personal expression preserved in English" rather than "speech translated in realtime"

## 4. One primary end-to-end user journey

This is the canonical MVP journey and should be the default implementation target.

1. The user lands on a simple session start screen with one primary action: start voice session.
2. The user grants microphone access.
3. The session enters a live conversation state with clear listening/speaking indicators and minimal controls.
4. The agent invites the user to talk casually about a familiar topic such as their weekend, hobbies, or food preferences in their native language.
5. The user speaks for a few short turns while the interface shows that PersonaFlow is actively engaged in the conversation.
6. The user ends the session explicitly with a single clear action.
7. The UI transitions into a short processing state that explains PersonaFlow is turning the conversation into personalized English phrases.
8. The results screen appears with a brief transcript summary and 3 to 5 English phrase cards derived from the userÅfs own meaning and tone.
9. The user reviews the cards and can immediately understand: "these are English expressions I could actually use."

## 5. One 30-60 second demo scenario

Demo scenario: "How I usually spend a relaxing Sunday"

1. The presenter starts a voice session.
2. The user says in their native language that they like slow Sundays, staying home, drinking coffee, and avoiding crowded places.
3. The agent responds naturally and asks one or two lightweight follow-up questions to keep the user talking.
4. After roughly 20 to 30 seconds of conversation, the presenter ends the session.
5. The app shows a short processing step, then returns phrase cards such as expressions for taking it easy, staying in, needing quiet time, or not feeling like going out.

This demo works because it is personal, casual, easy to improvise, and clearly different from literal translation.

## 6. Main UI states

The realtime voice UX should make these states explicit:

- Idle/start: session not started yet; start action is prominent
- Permission required: microphone access is needed before the session can continue
- Connecting: the app is establishing the live session
- Live listening: the system is ready for user speech
- Agent responding: the system is actively replying or speaking
- Live paused or interrupted: temporary loss of input, muted mic, or unstable session state
- Ending session: user has chosen to stop and the live interaction is closing
- Processing results: transcript is being finalized and phrase cards are being generated
- Results ready: phrase cards and supporting session output are visible
- Error/fallback: the normal live path failed and the UI must explain the next safe action

The UI should avoid dense controls. One primary action per state is preferred.

## 7. MVP scope

The hackathon realtime voice UX MVP includes:

- one clear start-to-finish voice session flow
- microphone permission handling
- obvious live-state feedback during conversation
- one explicit way to end the session
- short post-session processing feedback
- results view with transcript-derived personalized English phrase cards
- copy and interface language that reinforces self-expression preservation, not translation

## 8. Out-of-scope items

The following are out of scope for this spec and should not be implied by the UI:

- realtime sentence-by-sentence translation
- live bilingual subtitle experience
- grammar correction during conversation
- pronunciation scoring
- multiple conversation modes or branching demo paths
- long onboarding, profile setup, or account flows
- production-grade session orchestration design
- advanced analytics, history, exports, or spaced repetition systems

## 9. Expected failure handling UX

Failure handling should stay simple, visible, and demo-safe.

- Microphone denied: explain that microphone access is required for the voice session and offer a retry path
- Live connection failure: show a short message that the realtime session could not start and offer retry
- Mid-session interruption: show that the session was interrupted, preserve calm UI, and offer reconnect or end session
- Processing failure after conversation: explain that phrase card generation did not complete and offer retry from transcript if available
- Empty or too-short session: explain that more speech is needed to generate useful phrase cards and offer restart

Failure copy should never suggest that PersonaFlow is translating in realtime. The fallback message should preserve the framing that the main output is post-session learning material.

## 10. Demo success criteria

The hackathon demo is successful if:

- a first-time viewer can understand the product within one session
- the live UI visibly feels realtime and responsive
- the user speaks naturally instead of managing complex controls
- the end state clearly shows personalized English phrase cards based on the conversation
- the experience reads as "help me sound like myself in English" rather than "translate what I said"
- the demo can still recover gracefully from at least one common failure case
