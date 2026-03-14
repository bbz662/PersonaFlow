import assert from "node:assert/strict";
import test from "node:test";

import {
  initialVoiceSessionState,
  voiceSessionReducer,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from "./voice-session-state.ts";

function applyEvents(
  events: VoiceSessionEvent[],
  initialState: VoiceSessionState = initialVoiceSessionState,
) {
  return events.reduce(voiceSessionReducer, initialState);
}

test("connects and starts listening through explicit connected state", () => {
  const state = applyEvents([
    { type: "connect.request" },
    { type: "connected" },
    { type: "mic.start" },
  ]);

  assert.deepEqual(state, { status: "listening" });
});

test("cycles through thinking, tool run, speaking, and back to connected", () => {
  const state = applyEvents(
    [
      { type: "speech.detected" },
      { type: "tool.call.started" },
      { type: "tool.call.finished" },
      { type: "response.started" },
      { type: "response.ended" },
    ],
    { status: "listening" },
  );

  assert.deepEqual(state, { status: "connected" });
});

test("captures the interrupted source state explicitly", () => {
  const state = voiceSessionReducer({ status: "speaking" }, { type: "interruption" });

  assert.deepEqual(state, { status: "interrupted", interruptedFrom: "speaking" });
});

test("tracks reconnect attempts and returns to connected", () => {
  const state = applyEvents(
    [
      { type: "reconnect.request", attempt: 1, reason: "Socket dropped" },
      { type: "connected" },
    ],
    { status: "speaking" },
  );

  assert.deepEqual(state, { status: "connected" });
});

test("recovers from interruption back to a ready state", () => {
  const state = applyEvents(
    [{ type: "interruption.recovered" }],
    { status: "interrupted", interruptedFrom: "tool_running" },
  );

  assert.deepEqual(state, { status: "connected" });
});

test("stores recoverable and fatal errors explicitly", () => {
  const recoverable = voiceSessionReducer(
    { status: "tool_running" },
    { type: "recoverable.error", message: "Socket stalled" },
  );
  const fatal = voiceSessionReducer(recoverable, {
    type: "fatal.error",
    message: "Microphone permission denied",
  });

  assert.deepEqual(recoverable, {
    status: "error",
    message: "Socket stalled",
    recoverable: true,
  });
  assert.deepEqual(fatal, {
    status: "error",
    message: "Microphone permission denied",
    recoverable: false,
  });
});

test("rejects invalid transitions", () => {
  assert.throws(
    () => voiceSessionReducer({ status: "idle" }, { type: "response.started" }),
    /Invalid voice session transition: idle -> response\.started/,
  );
  assert.throws(
    () =>
      voiceSessionReducer(
        { status: "disconnected", reason: "remote" },
        { type: "mic.start" },
      ),
    /Invalid voice session transition: disconnected -> mic\.start/,
  );
  assert.throws(
    () => voiceSessionReducer({ status: "connected" }, { type: "interruption.recovered" }),
    /Invalid voice session transition: connected -> interruption\.recovered/,
  );
});
