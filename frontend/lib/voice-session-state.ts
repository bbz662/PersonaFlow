export type VoiceSessionStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "tool_running"
  | "interrupted"
  | "disconnected"
  | "error";

export type VoiceSessionState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "reconnecting"; attempt: number; reason: string }
  | { status: "connected" }
  | { status: "listening" }
  | { status: "thinking" }
  | { status: "speaking" }
  | { status: "tool_running" }
  | {
      status: "interrupted";
      interruptedFrom: Exclude<
        VoiceSessionStatus,
        "idle" | "interrupted" | "disconnected" | "error"
      >;
    }
  | { status: "disconnected"; reason: "client" | "remote" | "provider_error" }
  | { status: "error"; message: string; recoverable: boolean };

export type VoiceSessionEvent =
  | { type: "connect.request" }
  | { type: "reconnect.request"; attempt: number; reason: string }
  | { type: "connected" }
  | { type: "mic.start" }
  | { type: "mic.stop" }
  | { type: "speech.detected" }
  | { type: "response.started" }
  | { type: "response.ended" }
  | { type: "tool.call.started" }
  | { type: "tool.call.finished" }
  | { type: "interruption" }
  | { type: "interruption.recovered" }
  | { type: "disconnect"; reason: "client" | "remote" | "provider_error" }
  | { type: "recoverable.error"; message: string }
  | { type: "fatal.error"; message: string };

export const initialVoiceSessionState: VoiceSessionState = { status: "idle" };

function invalidTransition(state: VoiceSessionState, event: VoiceSessionEvent): never {
  throw new Error(`Invalid voice session transition: ${state.status} -> ${event.type}`);
}

export function voiceSessionReducer(
  state: VoiceSessionState,
  event: VoiceSessionEvent,
): VoiceSessionState {
  switch (event.type) {
    case "connect.request":
      if (
        state.status === "idle" ||
        state.status === "disconnected" ||
        state.status === "interrupted" ||
        state.status === "error"
      ) {
        return { status: "connecting" };
      }
      return invalidTransition(state, event);

    case "reconnect.request":
      if (
        state.status === "connecting" ||
        state.status === "connected" ||
        state.status === "listening" ||
        state.status === "thinking" ||
        state.status === "speaking" ||
        state.status === "tool_running" ||
        state.status === "interrupted" ||
        state.status === "disconnected" ||
        state.status === "error"
      ) {
        return {
          status: "reconnecting",
          attempt: event.attempt,
          reason: event.reason,
        };
      }
      return invalidTransition(state, event);

    case "connected":
      if (state.status === "connecting" || state.status === "reconnecting") {
        return { status: "connected" };
      }
      return invalidTransition(state, event);

    case "mic.start":
      if (state.status === "connected") {
        return { status: "listening" };
      }
      return invalidTransition(state, event);

    case "mic.stop":
      if (state.status === "listening") {
        return { status: "connected" };
      }
      return invalidTransition(state, event);

    case "speech.detected":
      if (state.status === "listening") {
        return { status: "thinking" };
      }
      return invalidTransition(state, event);

    case "tool.call.started":
      if (state.status === "thinking") {
        return { status: "tool_running" };
      }
      return invalidTransition(state, event);

    case "tool.call.finished":
      if (state.status === "tool_running") {
        return { status: "thinking" };
      }
      return invalidTransition(state, event);

    case "response.started":
      if (state.status === "thinking") {
        return { status: "speaking" };
      }
      return invalidTransition(state, event);

    case "response.ended":
      if (state.status === "speaking") {
        return { status: "connected" };
      }
      return invalidTransition(state, event);

    case "interruption":
      if (
        state.status === "connecting" ||
        state.status === "reconnecting" ||
        state.status === "connected" ||
        state.status === "listening" ||
        state.status === "thinking" ||
        state.status === "speaking" ||
        state.status === "tool_running"
      ) {
        return { status: "interrupted", interruptedFrom: state.status };
      }
      return invalidTransition(state, event);

    case "interruption.recovered":
      if (state.status === "interrupted") {
        return { status: "connected" };
      }
      return invalidTransition(state, event);

    case "disconnect":
      if (state.status === "disconnected") {
        return invalidTransition(state, event);
      }
      return { status: "disconnected", reason: event.reason };

    case "recoverable.error":
      return {
        status: "error",
        message: event.message,
        recoverable: true,
      };

    case "fatal.error":
      return {
        status: "error",
        message: event.message,
        recoverable: false,
      };
  }
}
