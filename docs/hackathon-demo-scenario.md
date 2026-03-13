# PersonaFlow Hackathon Demo Scenario

## Purpose

This document defines one narrow, repeatable demo path for the PersonaFlow realtime voice experience. The demo should show that PersonaFlow helps a learner speak naturally in their own language, then turns that session into a few English phrase cards that still feel personal.

## Demo Persona

- Name: Yuki
- Profile: Japanese professional in her 20s who can communicate in English but feels her English sounds flatter and less like her real personality.
- Goal in the demo: Talk casually about a familiar real-life situation and receive a few English phrases she would actually want to reuse.

## Primary Demo Scenario

### Scenario Summary

Yuki starts a voice session and casually talks in Japanese about a recent weekend cafe meetup with a friend. The assistant keeps the conversation moving in Japanese without correcting or translating every sentence. When the session ends, PersonaFlow generates 3 to 5 English phrase cards based on Yuki's own expressions and tone.

### Why This Scenario

- It is personal but low-risk.
- It naturally produces reusable everyday expressions.
- It demonstrates PersonaFlow's value without looking like live translation.
- It fits the MVP flow: voice session, transcript, post-session card generation, lightweight review screen.

## Demo Script

### Step 1: Initial Screen State

**User sees**

- A simple landing or session screen.
- Clear product framing around speaking naturally first.
- A primary action to start the voice session.
- An idle microphone/session state before conversation begins.

**Presenter says**

"PersonaFlow is for learners who want their English to still sound like them. Instead of translating every sentence in real time, it lets them speak naturally first and studies their own expressions afterward."

### Step 2: Start Voice Session

**Spoken user input**

No speech yet. The presenter taps the start button.

**Assistant behavior**

- Connects to the live voice session.
- Greets the user in Japanese.
- Prompts for a light, casual topic.

**UI displays**

- Session status changes from idle to live.
- Microphone/listening indicator becomes active.
- Transcript area or conversation area begins showing turns.

### Step 3: User Speaks Naturally

**Spoken user input**

Use one compact, repeatable utterance in Japanese, for example:

`昨日、友だちとカフェで長く話して、すごくいい気分転換になった。こういうゆるい時間って本当に大事だなと思った。`

Meaning for rehearsal only: the user says she talked with a friend at a cafe for a long time yesterday, it felt refreshing, and relaxed time like that really matters.

**Assistant behavior**

- Responds in Japanese.
- Acknowledges the feeling and asks one short follow-up question.
- Keeps the exchange conversational rather than instructional.
- Avoids giving immediate English translation or grammar correction.

**UI displays**

- The user's spoken turn appears as text in the transcript area.
- The assistant response appears underneath.
- Session remains clearly marked as live.

### Step 4: One Follow-Up Turn

**Spoken user input**

Use one short follow-up answer in Japanese, for example:

`最近ちょっと忙しかったから、ただのんびり話せたのがよかった。`

Meaning for rehearsal only: the user says she has been busy lately, so it was nice to simply talk and relax.

**Assistant behavior**

- Gives a brief natural response in Japanese.
- Signals that the conversation captured enough material for review.
- Does not expand into a long multi-topic conversation.

**UI displays**

- Second user turn is added to transcript.
- Second assistant turn is added.
- End-session control remains visible and easy to use.

### Step 5: End Session

**Spoken user input**

No additional required speech. The presenter ends the session.

**Assistant behavior**

- Stops live streaming.
- Finalizes the transcript for the session.

**Where the backend/domain tool is invoked**

This is the explicit tool invocation point:

- After the user ends the live voice session.
- The backend receives the finalized text transcript.
- The domain tool generates 3 to 5 personalized English phrase cards from the transcript.
- The tool should preserve tone and personal expression, not produce line-by-line translation.

**UI displays**

- Live state changes to processing.
- A concise loading state indicates that PersonaFlow is generating phrase cards from the conversation.

### Step 6: Results Screen

**Assistant behavior**

- No more live voice interaction is required.
- The system returns phrase cards for review.

**UI displays**

- A lightweight results screen.
- 3 to 5 English phrase cards derived from the user's transcript.
- Each card should visibly feel tied to the user's own meaning and tone.
- Optional supporting fields can include the original idea, tone label, or short usage note.

**Examples of the type of output expected**

- "I really needed that kind of slow, easy time."
- "It was such a nice reset."
- "We've both been busy, so it felt good to just sit and talk."

These examples are rehearsal targets, not implementation requirements.

## Successful Completion Criteria

The demo is successful if all of the following are visible:

1. The user starts a live voice session.
2. The user speaks naturally in Japanese for one short topic.
3. The assistant responds conversationally without becoming a realtime translator.
4. The transcript visibly accumulates during the session.
5. The explicit post-session tool invocation happens after ending the session.
6. The app returns 3 to 5 English phrase cards based on the user's own expressions.
7. The final output feels personal and reusable, not generic and not literal sentence conversion.

## Degraded / Fallback Flow

Use one fallback path only.

### If tool execution fails after the session

**Fallback behavior**

- Keep the completed transcript visible.
- Show a concise message that card generation is temporarily unavailable.
- Present 1 to 3 pre-prepared example phrase cards that are clearly labeled as demo fallback content.

**Presenter framing**

"The live conversation and transcript capture still worked. The final card generation step is the backend enrichment step, and this fallback shows the kind of personalized phrase output the user normally receives."

### If live voice streaming fails at session start

**Fallback behavior**

- Do not attempt multiple alternative demo paths.
- Use a typed transcript stub or preloaded transcript for the same cafe scenario.
- Move directly to the post-session processing state and results review.

**Presenter framing**

"The essential product value is the same: the user expresses a personal thought first, then PersonaFlow turns that moment into reusable English phrases afterward."

## Rehearsal Checklist

- Confirm the app opens on the initial session screen with the start action visible.
- Confirm microphone permission and live session connection before presenting.
- Rehearse the two Japanese utterances exactly as written to keep the demo repeatable.
- Keep the live conversation to one initial turn and one follow-up turn.
- End the session manually once enough transcript is visible.
- Confirm the processing state appears immediately after ending the session.
- Confirm 3 to 5 phrase cards load on the results screen.
- Keep the fallback transcript and fallback cards ready in case voice or tool execution fails.
