import type { AudioChunk } from "./audio-io-chunk.ts";

export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "failed"
  | "ended";

export type RealtimeTranscriptEvent = {
  type: "transcript.received";
  speaker: "agent" | "user" | "system";
  text: string;
};

export type RealtimeAudioOutputEvent = {
  type: "response.audio";
  chunk: AudioChunk;
};

export type RealtimeToolCallEvent = {
  type: "tool.call.requested";
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type RealtimeSessionLifecycleEvent =
  | {
      type: "connected";
      sessionId: string;
    }
  | {
      type: "session.closed";
      reason: "client" | "remote";
    };

export type RealtimeSessionErrorEvent =
  | {
      type: "recoverable.error";
      message: string;
    }
  | {
      type: "fatal.error";
      message: string;
    };

export type RealtimeSessionEvent =
  | RealtimeSessionLifecycleEvent
  | RealtimeTranscriptEvent
  | RealtimeAudioOutputEvent
  | RealtimeToolCallEvent
  | RealtimeSessionErrorEvent;

export type RealtimeSessionEventHandler = (
  event: RealtimeSessionEvent,
) => void;

export interface RealtimeSessionClient {
  readonly connectionState: RealtimeConnectionState;
  connect(): void;
  disconnect(): void;
  sendUserAudio(chunk: AudioChunk): void;
  subscribe(listener: RealtimeSessionEventHandler): () => void;
}
