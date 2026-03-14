import type { AudioChunk } from "./audio-io-chunk.ts";
import type {
  RealtimeClientEventInput,
  RealtimeConnectionState,
  RealtimeSessionClient,
  RealtimeSessionEvent,
  RealtimeSessionEventHandler,
  RealtimeToolErrorInput,
  RealtimeToolResultInput,
  RealtimeUserTranscriptInput,
} from "./realtime-session-client.ts";

type ProviderSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

type ProviderSocketFactory = (url: string) => ProviderSocket;

type GeminiLiveClientOptions = {
  sessionId: string;
  apiBaseUrl: string;
  createSocket?: ProviderSocketFactory;
  onConnectionStateChange?: (state: RealtimeConnectionState) => void;
};

type TransportMessage =
  | {
      type: "connection.state";
      state: RealtimeConnectionState;
      session_id: string;
    }
  | {
      type: "session.event";
      event: ProviderEventPayload;
    };

type ProviderEventPayload = {
  kind: string;
  speaker?: "agent" | "user" | "system";
  text?: string;
  audio?: {
    sample_rate?: number;
    sampleRate?: number;
    samples?: number[];
  };
  tool_call?: {
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  };
  tool_result?: {
    id?: string;
    name?: string;
    result?: Record<string, unknown>;
  };
  tool_error?: {
    id?: string;
    name?: string;
    message?: string;
    code?: string;
  };
  function_call?: {
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

function buildTransportUrl(apiBaseUrl: string, sessionId: string) {
  const baseUrl = new URL(apiBaseUrl);
  const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${baseUrl.host}/sessions/${sessionId}/live`;
}

function defaultSocketFactory(url: string): ProviderSocket {
  return new WebSocket(url);
}

function normalizeAudioChunk(audio: ProviderEventPayload["audio"]): AudioChunk | null {
  if (!audio || !Array.isArray(audio.samples) || audio.samples.length === 0) {
    return null;
  }

  const sampleRate = audio.sample_rate ?? audio.sampleRate ?? 24_000;

  return {
    sampleRate,
    samples: Float32Array.from(audio.samples),
  };
}

function mapProviderEvent(event: ProviderEventPayload): RealtimeSessionEvent | null {
  if (
    event.kind === "tool_call" ||
    event.kind === "tool.call" ||
    event.kind === "function_call"
  ) {
    const toolCall = event.tool_call ?? event.function_call;
    if (!toolCall?.name) {
      return null;
    }

    return {
      type: "tool.call.requested",
      callId: toolCall.id ?? crypto.randomUUID(),
      name: toolCall.name,
      arguments: toolCall.arguments ?? {},
    };
  }

  if (event.kind === "tool_result") {
    const toolResult = event.tool_result;
    if (!toolResult?.name) {
      return null;
    }

    return {
      type: "tool.result.received",
      callId: toolResult.id ?? crypto.randomUUID(),
      name: toolResult.name,
      result: toolResult.result ?? {},
    };
  }

  if (event.kind === "tool_error") {
    const toolError = event.tool_error;
    if (!toolError?.name) {
      return null;
    }

    return {
      type: "tool.error.received",
      callId: toolError.id ?? crypto.randomUUID(),
      name: toolError.name,
      message: toolError.message ?? "Tool execution failed.",
      code: toolError.code ?? "tool_error",
    };
  }

  if (event.kind === "model_audio" || event.kind === "response.audio") {
    const chunk = normalizeAudioChunk(event.audio);
    if (!chunk) {
      return null;
    }

    return {
      type: "response.audio",
      chunk,
    };
  }

  if (typeof event.text === "string" && event.text.trim().length > 0) {
    return {
      type: "transcript.received",
      speaker: event.speaker ?? "system",
      text: event.text,
    };
  }

  return null;
}

export class GeminiLiveClient implements RealtimeSessionClient {
  private readonly sessionId: string;
  private readonly apiBaseUrl: string;
  private readonly createSocket: ProviderSocketFactory;
  private readonly onConnectionStateChange?: (
    state: RealtimeConnectionState,
  ) => void;
  private readonly listeners = new Set<RealtimeSessionEventHandler>();

  private socket: ProviderSocket | null = null;
  private currentState: RealtimeConnectionState = "ended";
  private disconnectInitiatedByClient = false;
  private closeEmitted = false;

  constructor(options: GeminiLiveClientOptions) {
    this.sessionId = options.sessionId;
    this.apiBaseUrl = options.apiBaseUrl;
    this.createSocket = options.createSocket ?? defaultSocketFactory;
    this.onConnectionStateChange = options.onConnectionStateChange;
  }

  get connectionState() {
    return this.currentState;
  }

  connect() {
    if (this.socket) {
      return;
    }

    this.disconnectInitiatedByClient = false;
    this.closeEmitted = false;
    this.updateState("connecting");

    const socket = this.createSocket(
      buildTransportUrl(this.apiBaseUrl, this.sessionId),
    );

    socket.onopen = () => {
      this.socket = socket;
    };

    socket.onmessage = (messageEvent) => {
      const payload = JSON.parse(messageEvent.data) as TransportMessage;

      if (payload.type === "connection.state") {
        this.handleConnectionState(payload.state, payload.session_id);
        return;
      }

      const appEvent = mapProviderEvent(payload.event);
      if (appEvent) {
        this.emit(appEvent);
      }
    };

    socket.onerror = () => {
      this.updateState("failed");
      this.emit({
        type: "recoverable.error",
        message: "Gemini Live session connection failed.",
      });
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.currentState !== "failed") {
        this.updateState("ended");
      }
      this.emitSessionClosed();
    };

    this.socket = socket;
  }

  disconnect() {
    this.disconnectInitiatedByClient = true;

    if (!this.socket) {
      this.updateState("ended");
      this.emitSessionClosed();
      return;
    }

    if (this.currentState === "connected") {
      this.socket.send(JSON.stringify({ type: "session.end" }));
      return;
    }

    this.socket.close();
  }

  sendUserAudio(chunk: AudioChunk) {
    if (!this.socket || this.currentState !== "connected") {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "user.audio",
        audio: {
          sample_rate: chunk.sampleRate,
          samples: Array.from(chunk.samples),
        },
      }),
    );
  }

  sendUserTranscript(input: RealtimeUserTranscriptInput) {
    this.sendClientEvent({
      kind: "user.transcript",
      text: input.text,
      language: input.language,
      turn_index: input.turnIndex,
    });
  }

  sendClientEvent(event: RealtimeClientEventInput) {
    if (!this.socket || this.currentState !== "connected") {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "client.event",
        event,
      }),
    );
  }

  sendToolResult(input: RealtimeToolResultInput) {
    if (!this.socket || this.currentState !== "connected") {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "tool.result",
        call_id: input.callId,
        name: input.name,
        result: input.result,
      }),
    );
  }

  sendToolError(input: RealtimeToolErrorInput) {
    if (!this.socket || this.currentState !== "connected") {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "tool.error",
        call_id: input.callId,
        name: input.name,
        error: {
          message: input.message,
          code: input.code,
        },
      }),
    );
  }

  subscribe(listener: RealtimeSessionEventHandler) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleConnectionState(
    state: RealtimeConnectionState,
    sessionId: string,
  ) {
    this.updateState(state);

    if (state === "connected") {
      this.emit({ type: "connected", sessionId });
      return;
    }

    if (state === "failed") {
      this.emit({
        type: "fatal.error",
        message: "Gemini Live session failed to initialize.",
      });
      return;
    }

    if (state === "ended") {
      this.emitSessionClosed();
    }
  }

  private emit(event: RealtimeSessionEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private emitSessionClosed() {
    if (this.closeEmitted) {
      return;
    }

    this.closeEmitted = true;
    this.emit({
      type: "session.closed",
      reason: this.disconnectInitiatedByClient ? "client" : "remote",
    });
  }

  private updateState(state: RealtimeConnectionState) {
    if (this.currentState === state) {
      return;
    }

    this.currentState = state;
    this.onConnectionStateChange?.(state);
  }
}

export function createGeminiLiveClient(
  options: GeminiLiveClientOptions,
): RealtimeSessionClient {
  return new GeminiLiveClient(options);
}
