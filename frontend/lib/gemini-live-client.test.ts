import assert from "node:assert/strict";
import test from "node:test";

import { GeminiLiveClient } from "./gemini-live-client.ts";
import { createSineWaveChunk } from "./audio-io-chunk.ts";
import type { RealtimeSessionEvent } from "./realtime-session-client.ts";

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  readonly sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  fail() {
    this.onerror?.();
  }
}

test("GeminiLiveClient translates connection and close events", () => {
  const socket = new FakeSocket();
  const events: RealtimeSessionEvent[] = [];
  const connectionStates: string[] = [];

  const client = new GeminiLiveClient({
    sessionId: "session-123",
    apiBaseUrl: "http://localhost:8000",
    createSocket: () => socket,
    onConnectionStateChange: (state) => {
      connectionStates.push(state);
    },
  });

  client.subscribe((event) => {
    events.push(event);
  });

  client.connect();
  socket.open();
  socket.message({
    type: "connection.state",
    state: "connected",
    session_id: "session-123",
  });
  client.disconnect();
  socket.message({
    type: "connection.state",
    state: "ended",
    session_id: "session-123",
  });
  socket.close();

  assert.deepEqual(connectionStates, ["connecting", "connected", "ended"]);
  assert.deepEqual(events, [
    { type: "connected", sessionId: "session-123" },
    { type: "session.closed", reason: "client" },
  ]);
  assert.deepEqual(socket.sent, [JSON.stringify({ type: "session.end" })]);
});

test("GeminiLiveClient translates transcript, audio, tool calls, and outgoing user audio", () => {
  const socket = new FakeSocket();
  const events: RealtimeSessionEvent[] = [];

  const client = new GeminiLiveClient({
    sessionId: "session-456",
    apiBaseUrl: "http://localhost:8000",
    createSocket: () => socket,
  });

  client.subscribe((event) => {
    events.push(event);
  });

  client.connect();
  socket.open();
  socket.message({
    type: "connection.state",
    state: "connected",
    session_id: "session-456",
  });
  socket.message({
    type: "session.event",
    event: {
      kind: "transcript",
      speaker: "agent",
      text: "Tell me about your day.",
    },
  });
  socket.message({
    type: "session.event",
    event: {
      kind: "response.audio",
      audio: {
        sample_rate: 24000,
        samples: [0.1, -0.2, 0.3],
      },
    },
  });
  socket.message({
    type: "session.event",
    event: {
      kind: "tool_call",
      tool_call: {
        id: "tool-1",
        name: "save_transcript_snippet",
        arguments: {
          text: "I always overthink before speaking.",
        },
      },
    },
  });
  socket.message({
    type: "session.event",
    event: {
      kind: "tool_result",
      tool_result: {
        id: "tool-1",
        name: "generate_phrase_card_preview",
        result: {
          tool_name: "generate_phrase_card_preview",
          summary: "Prepared 1 phrase card preview.",
          card_count: 1,
          cards: [],
        },
      },
    },
  });
  socket.message({
    type: "session.event",
    event: {
      kind: "tool_error",
      tool_error: {
        id: "tool-2",
        name: "generate_phrase_card_preview",
        message: "Timed out.",
        code: "timeout",
      },
    },
  });

  client.sendUserAudio(createSineWaveChunk({ durationMs: 10 }));
  client.sendUserTranscript({
    text: "Turn this into a phrase card: I stayed in and made curry.",
    language: "ja",
    turnIndex: 2,
  });
  client.sendClientEvent({
    kind: "response.cancel",
    text: "Client requested immediate playback interruption.",
  });
  client.sendToolResult({
    callId: "tool-1",
    name: "generate_phrase_card_preview",
    result: { ok: true },
  });
  client.sendToolError({
    callId: "tool-2",
    name: "generate_phrase_card_preview",
    message: "Timed out.",
    code: "timeout",
  });

  assert.equal(events.length, 6);
  assert.deepEqual(events[0], { type: "connected", sessionId: "session-456" });
  assert.deepEqual(events[1], {
    type: "transcript.received",
    speaker: "agent",
    text: "Tell me about your day.",
  });
  assert.equal(events[2]?.type, "response.audio");
  assert.equal(events[2]?.type === "response.audio" ? events[2].chunk.sampleRate : 0, 24000);
  assert.deepEqual(events[3], {
    type: "tool.call.requested",
    callId: "tool-1",
    name: "save_transcript_snippet",
    arguments: {
      text: "I always overthink before speaking.",
    },
  });
  assert.deepEqual(events[4], {
    type: "tool.result.received",
    callId: "tool-1",
    name: "generate_phrase_card_preview",
    result: {
      tool_name: "generate_phrase_card_preview",
      summary: "Prepared 1 phrase card preview.",
      card_count: 1,
      cards: [],
    },
  });
  assert.deepEqual(events[5], {
    type: "tool.error.received",
    callId: "tool-2",
    name: "generate_phrase_card_preview",
    message: "Timed out.",
    code: "timeout",
  });

  assert.equal(socket.sent.length, 5);
  const sentPayload = JSON.parse(socket.sent[0] ?? "{}");
  assert.equal(sentPayload.type, "user.audio");
  assert.equal(sentPayload.audio.sample_rate, 24000);
  assert.ok(Array.isArray(sentPayload.audio.samples));
  assert.ok(sentPayload.audio.samples.length > 0);
  assert.deepEqual(JSON.parse(socket.sent[1] ?? "{}"), {
    type: "client.event",
    event: {
      kind: "user.transcript",
      text: "Turn this into a phrase card: I stayed in and made curry.",
      language: "ja",
      turn_index: 2,
    },
  });
  assert.deepEqual(JSON.parse(socket.sent[2] ?? "{}"), {
    type: "client.event",
    event: {
      kind: "response.cancel",
      text: "Client requested immediate playback interruption.",
    },
  });
  assert.deepEqual(JSON.parse(socket.sent[3] ?? "{}"), {
    type: "tool.result",
    call_id: "tool-1",
    name: "generate_phrase_card_preview",
    result: { ok: true },
  });
  assert.deepEqual(JSON.parse(socket.sent[4] ?? "{}"), {
    type: "tool.error",
    call_id: "tool-2",
    name: "generate_phrase_card_preview",
    error: {
      message: "Timed out.",
      code: "timeout",
    },
  });
});

test("GeminiLiveClient surfaces transport failures as recoverable errors", () => {
  const socket = new FakeSocket();
  const events: RealtimeSessionEvent[] = [];
  const connectionStates: string[] = [];

  const client = new GeminiLiveClient({
    sessionId: "session-789",
    apiBaseUrl: "http://localhost:8000",
    createSocket: () => socket,
    onConnectionStateChange: (state) => {
      connectionStates.push(state);
    },
  });

  client.subscribe((event) => {
    events.push(event);
  });

  client.connect();
  socket.fail();

  assert.deepEqual(connectionStates, ["connecting", "failed"]);
  assert.deepEqual(events, [
    {
      type: "recoverable.error",
      message: "Gemini Live session connection failed.",
    },
  ]);
});
