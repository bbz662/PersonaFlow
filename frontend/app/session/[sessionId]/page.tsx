"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { createAudioIO, type AudioIO, type AudioIOMode } from "../../../lib/audio-io";
import { createGeminiLiveClient } from "../../../lib/gemini-live-client";
import {
  PersonaFlowToolBridge,
  PHRASE_CARD_TOOL_NAME,
  type PhraseCardPreviewResult,
} from "../../../lib/personaflow-tool-bridge";
import {
  createRealtimeLogEntry,
  writeRealtimeLog,
  type RealtimeLogEntry,
  type RealtimeLogFields,
  type RealtimeLogLevel,
} from "../../../lib/realtime-observability";
import {
  defaultRealtimeAudioMode,
  realtimeVoiceEnabled,
} from "../../../lib/runtime-config";
import type {
  RealtimeConnectionState,
  RealtimeSessionClient,
  RealtimeSessionEvent,
  RealtimeToolCallEvent,
} from "../../../lib/realtime-session-client";
import {
  initialVoiceSessionState,
  voiceSessionReducer,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from "../../../lib/voice-session-state";

type EventFeedEntry = {
  id: string;
  speaker: string;
  kind: "user" | "assistant" | "tool_call" | "tool_result" | "system" | "error";
  label: string;
  text: string;
};

type SessionCompletionResponse = {
  session_id: string;
  status: "completed";
  ended_at: string;
  processing_started_at: string;
  completed_at: string;
};

type SessionViewState = "live" | "processing";

type ToolPanelState = {
  status: "idle" | "running" | "completed" | "failed" | "timed_out";
  name: string;
  summary: string;
  output: string;
  callId: string | null;
};

type TranscriptHealthState = {
  status: "idle" | "capturing" | "partial" | "complete";
  summary: string;
};

type DebugEventEntry = RealtimeLogEntry & {
  id: string;
};

type StartConnectionOptions = {
  reconnect?: boolean;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_DELAY_MS = 1_200;
const DEBUG_EVENT_LIMIT = 40;

const voiceStateCopy: Record<VoiceSessionState["status"], string> = {
  idle: "Ready to connect",
  connecting: "Connecting live session",
  reconnecting: "Recovering the live session",
  connected: "Connected and waiting for a turn",
  listening: "Listening to the learner",
  thinking: "Preparing the tool handoff",
  tool_running: "Running phrase-card preview",
  speaking: "Playing the assistant reply",
  interrupted: "Playback interrupted",
  disconnected: "Connection closed",
  error: "Attention needed",
};

const initialToolState: ToolPanelState = {
  status: "idle",
  name: "Phrase card preview",
  summary: "Waiting for the live session to invoke the PersonaFlow tool.",
  output: "No tool run yet.",
  callId: null,
};

const initialTranscriptHealth: TranscriptHealthState = {
  status: "idle",
  summary: "No live transcript captured yet.",
};

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function buildFeedEntry(event: RealtimeSessionEvent, index: number): EventFeedEntry {
  switch (event.type) {
    case "connected":
      return {
        id: `connected-${index}`,
        speaker: "Session",
        kind: "system",
        label: "Live session",
        text: `Gemini Live connected for session ${event.sessionId}.`,
      };

    case "transcript.received":
      return {
        id: `transcript-${index}`,
        speaker:
          event.speaker === "agent"
            ? "PersonaFlow"
            : event.speaker === "user"
              ? "You"
              : "Session event",
        kind:
          event.speaker === "agent"
            ? "assistant"
            : event.speaker === "user"
              ? "user"
              : "system",
        label:
          event.speaker === "agent"
            ? "Assistant reply"
            : event.speaker === "user"
              ? "Learner turn"
              : "Session event",
        text: event.text,
      };

    case "response.audio":
      return {
        id: `audio-${index}`,
        speaker: "Audio",
        kind: "system",
        label: "Audio playback",
        text: `Assistant playback received ${event.chunk.samples.length} audio samples.`,
      };

    case "tool.call.requested":
      return {
        id: `tool-${index}`,
        speaker: "Tool request",
        kind: "tool_call",
        label: "Tool invoked",
        text: `${event.name} requested by Gemini Live.`,
      };

    case "tool.result.received":
      return {
        id: `tool-result-${index}`,
        speaker: "Tool result",
        kind: "tool_result",
        label: "Tool result",
        text: `${event.name} returned structured data to the live session.`,
      };

    case "tool.error.received":
      return {
        id: `tool-error-${index}`,
        speaker: "Tool error",
        kind: "error",
        label: "Tool error",
        text: `${event.name} failed: ${event.message}`,
      };

    case "session.closed":
      return {
        id: `closed-${index}`,
        speaker: "Session",
        kind: "system",
        label: "Session closed",
        text:
          event.reason === "client"
            ? "Gemini Live session closed by the client."
            : "Gemini Live session closed by the provider.",
      };

    case "recoverable.error":
    case "fatal.error":
      return {
        id: `error-${index}`,
        speaker: "Error",
        kind: "error",
        label: event.type === "recoverable.error" ? "Recoverable error" : "Fatal error",
        text: event.message,
      };
  }
}

function resolveAudioMode(searchParams: ReturnType<typeof useSearchParams>): AudioIOMode {
  return searchParams.get("audio") === "browser" ? "browser" : defaultRealtimeAudioMode;
}

function isTurnActive(status: VoiceSessionState["status"]) {
  return (
    status === "listening" ||
    status === "thinking" ||
    status === "tool_running" ||
    status === "speaking"
  );
}

function getStatusTone(
  voiceState: VoiceSessionState,
  connectionState: RealtimeConnectionState,
): "active" | "warn" | "error" | "neutral" {
  if (voiceState.status === "error" || connectionState === "failed") {
    return "error";
  }

  if (
    voiceState.status === "reconnecting" ||
    voiceState.status === "interrupted" ||
    voiceState.status === "disconnected" ||
    connectionState === "connecting"
  ) {
    return "warn";
  }

  if (
    voiceState.status === "listening" ||
    voiceState.status === "thinking" ||
    voiceState.status === "tool_running" ||
    voiceState.status === "speaking" ||
    connectionState === "connected"
  ) {
    return "active";
  }

  return "neutral";
}

function getNowCopy(voiceState: VoiceSessionState, connectionState: RealtimeConnectionState) {
  if (voiceState.status === "reconnecting") {
    return {
      title: "Recovering the live demo",
      body: `Reconnect attempt ${voiceState.attempt} of ${MAX_RECONNECT_ATTEMPTS}. ${voiceState.reason}`,
    };
  }

  if (voiceState.status === "error") {
    return {
      title: voiceState.recoverable ? "The demo needs a retry" : "The live session stopped",
      body: voiceState.message,
    };
  }

  switch (voiceState.status) {
    case "idle":
      return {
        title: "Ready to start the live demo",
        body: "Open the live connection to show one spoken turn becoming a phrase-card preview.",
      };
    case "connecting":
      return {
        title: "Opening Gemini Live",
        body: "PersonaFlow is establishing the live session before the learner turn begins.",
      };
    case "connected":
      return {
        title: "Waiting for the learner turn",
        body: "The session is live and ready to capture the next spoken moment.",
      };
    case "listening":
      return {
        title: "Listening to the learner",
        body: "PersonaFlow is capturing the spoken turn before preparing a phrase-card preview.",
      };
    case "thinking":
      return {
        title: "Interpreting the turn",
        body: "The assistant is deciding how to turn this personal moment into a reusable English phrase.",
      };
    case "tool_running":
      return {
        title: "Generating phrase-card preview",
        body: "The PersonaFlow tool is running now and the result will feed the assistant reply.",
      };
    case "speaking":
      return {
        title: "Responding with the result",
        body: "The assistant is speaking back using the completed phrase-card preview.",
      };
    case "interrupted":
      return {
        title: "Turn interrupted",
        body: "Playback was stopped. Retry the turn to continue the same demo story.",
      };
    case "disconnected":
      return {
        title: "Live connection closed",
        body:
          connectionState === "ended"
            ? "The session is stopped. Start the connection again to rerun the demo."
            : "Reconnect to return to a usable live-demo state.",
      };
  }
}

function getNextStepCopy(
  voiceState: VoiceSessionState,
  connectionState: RealtimeConnectionState,
) {
  if (voiceState.status === "error") {
    return voiceState.recoverable
      ? "Retry the connection to recover the demo state."
      : "Start a fresh live connection before ending the session.";
  }

  if (voiceState.status === "reconnecting") {
    return "Wait for the transport to reopen, then rerun the demo turn.";
  }

  if (connectionState === "ended" || connectionState === "failed" || voiceState.status === "idle") {
    return "Start the live connection.";
  }

  if (voiceState.status === "connected") {
    return "Let the learner speak or run the demo turn again.";
  }

  if (voiceState.status === "listening") {
    return "Finish the spoken turn.";
  }

  if (voiceState.status === "thinking" || voiceState.status === "tool_running") {
    return "Wait for the tool result.";
  }

  if (voiceState.status === "speaking") {
    return "Let the assistant finish or interrupt and retry.";
  }

  return "Use retry if you want to rerun the same scenario.";
}

export default function LiveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientRef = useRef<RealtimeSessionClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<AudioIO | null>(null);
  const toolBridgeRef = useRef(new PersonaFlowToolBridge());
  const voiceStateRef = useRef<VoiceSessionState>(initialVoiceSessionState);
  const shouldAutoStartTurnRef = useRef(true);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const inputChunkCountRef = useRef(0);
  const transcriptTurnIndexRef = useRef(0);
  const connectionAttemptIdRef = useRef<string | null>(null);
  const providerConnectionIdRef = useRef<string | null>(null);
  const [voiceState, dispatchVoiceState] = useReducer(
    voiceSessionReducer,
    initialVoiceSessionState,
  );
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("ended");
  const [eventFeed, setEventFeed] = useState<EventFeedEntry[]>([]);
  const [viewState, setViewState] = useState<SessionViewState>("live");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [toolState, setToolState] = useState<ToolPanelState>(initialToolState);
  const [assistantOutput, setAssistantOutput] = useState(
    "The assistant reply will appear here after the tool returns.",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [transcriptSaveError, setTranscriptSaveError] = useState<string | null>(null);
  const [transcriptHealth, setTranscriptHealth] =
    useState<TranscriptHealthState>(initialTranscriptHealth);
  const [debugEvents, setDebugEvents] = useState<DebugEventEntry[]>([]);

  const sessionId = params.sessionId;
  const audioMode = resolveAudioMode(searchParams);
  const debugEnabled = searchParams.get("debug") === "1";
  const startedAt = searchParams.get("startedAt");
  const startedAtLabel = startedAt ? new Date(startedAt).toLocaleString() : "Just now";
  const canStart =
    connectionState === "ended" ||
    connectionState === "failed" ||
    voiceState.status === "disconnected" ||
    voiceState.status === "error";
  const canStop =
    connectionState === "connecting" ||
    connectionState === "connected" ||
    voiceState.status === "reconnecting";
  const isEnding = viewState === "processing";
  const canRetryTurn =
    connectionState === "connected" &&
    ["connected", "listening", "thinking", "tool_running", "speaking", "interrupted"].includes(
      voiceState.status,
    );
  const liveStatusTone = getStatusTone(voiceState, connectionState);
  const nowCopy = getNowCopy(voiceState, connectionState);
  const nextStepCopy = getNextStepCopy(voiceState, connectionState);
  const latestUserEntry = [...eventFeed].reverse().find((entry) => entry.kind === "user");
  const latestAssistantEntry = [...eventFeed].reverse().find((entry) => entry.kind === "assistant");
  const toolHistoryEntries = eventFeed.filter(
    (entry) => entry.kind === "tool_call" || entry.kind === "tool_result",
  );
  const visibleErrors = [sessionError, transcriptSaveError, completionError].filter(
    (error): error is string => Boolean(error),
  );

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  function observe(
    event: string,
    options?: {
      level?: RealtimeLogLevel;
      fields?: RealtimeLogFields;
      store?: boolean;
    },
  ) {
    const entry = createRealtimeLogEntry({
      event,
      level: options?.level,
      sessionId,
      fields: {
        audio_mode: audioMode,
        connection_attempt_id: connectionAttemptIdRef.current,
        provider_connection_id: providerConnectionIdRef.current,
        ...options?.fields,
      },
    });

    writeRealtimeLog(entry);
    if (options?.store === false) {
      return;
    }

    setDebugEvents((current) => [
      ...current.slice(-(DEBUG_EVENT_LIMIT - 1)),
      {
        ...entry,
        id: `${entry.timestamp}-${current.length}-${crypto.randomUUID()}`,
      },
    ]);
  }

  function dispatchIfValid(event: VoiceSessionEvent) {
    const currentState = voiceStateRef.current;

    try {
      const nextState = voiceSessionReducer(currentState, event);
      voiceStateRef.current = nextState;
      dispatchVoiceState(event);
      observe("voice.state.transition", {
        fields: {
          trigger: event.type,
          from_state: currentState.status,
          to_state: nextState.status,
          reconnect_attempt:
            event.type === "reconnect.request" ? event.attempt : reconnectAttemptRef.current,
        },
      });
      if (event.type === "recoverable.error" || event.type === "fatal.error") {
        observe(`voice.error.${event.type === "recoverable.error" ? "recoverable" : "fatal"}`, {
          level: event.type === "recoverable.error" ? "warn" : "error",
          fields: {
            message: event.message,
          },
        });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Invalid voice session transition:")
      ) {
        return;
      }

      throw error;
    }
  }

  function appendEvent(event: RealtimeSessionEvent) {
    setEventFeed((current) => [...current, buildFeedEntry(event, current.length)]);
  }

  function appendLocalEvent(speaker: string, text: string) {
    setEventFeed((current) => [
      ...current,
      {
        id: `local-${current.length}-${crypto.randomUUID()}`,
        speaker,
        kind: "system",
        label: "Session event",
        text,
      },
    ]);
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function buildToolOutput(result: PhraseCardPreviewResult) {
    if (result.cards.length === 0) {
      return result.summary;
    }

    return result.cards
      .slice(0, 2)
      .map(
        (card, index) =>
          `${index + 1}. ${card.english_expression} (${card.tone_tag})\n   ${card.usage_note}`,
      )
      .join("\n");
  }

  function resetTurnCycle() {
    inputChunkCountRef.current = 0;
    setToolState(initialToolState);
    setAssistantOutput("Listening for the next spoken turn.");
    setSessionError(null);
    setTranscriptHealth({
      status: "capturing",
      summary: "Listening for a clean user transcript.",
    });
  }

  function markTranscriptPartial(summary: string) {
    setTranscriptHealth((current) => {
      if (current.status === "complete") {
        return current;
      }

      return {
        status: "partial",
        summary,
      };
    });
  }

  async function persistTranscriptEntry(
    speaker: "user" | "agent",
    text: string,
    language: string,
  ) {
    try {
      const turnIndex = transcriptTurnIndexRef.current;
      transcriptTurnIndexRef.current += 1;

      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/transcript`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: [
            {
              entry_id: crypto.randomUUID(),
              speaker,
              text,
              language,
              timestamp: new Date().toISOString(),
              turn_index: turnIndex,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save live transcript to the session.");
      }

      setTranscriptSaveError(null);
    } catch (error) {
      setTranscriptSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save live transcript to the session.",
      );
    }
  }

  async function handleToolCall(event: RealtimeToolCallEvent) {
    observe("voice.tool.invocation.started", {
      fields: {
        tool_call_id: event.callId,
        tool_name: event.name,
      },
    });

    setToolState({
      status: "running",
      name: event.name,
      summary: "PersonaFlow is generating phrase-card previews from the latest spoken turn.",
      output: "Waiting for backend tool output...",
      callId: event.callId,
    });

    const dispatchResult = await toolBridgeRef.current.dispatch(event, {
      sessionId,
      apiBaseUrl: API_BASE_URL,
      observe,
    });

    if (dispatchResult.status === "completed") {
      observe("voice.tool.invocation.completed", {
        fields: {
          tool_call_id: event.callId,
          tool_request_id: dispatchResult.requestId,
          tool_name: event.name,
          duration_ms: dispatchResult.durationMs,
          card_count: dispatchResult.result.card_count,
        },
      });
      setToolState({
        status: "completed",
        name: event.name,
        summary: dispatchResult.result.summary,
        output: buildToolOutput(dispatchResult.result),
        callId: event.callId,
      });
      clientRef.current?.sendToolResult({
        callId: event.callId,
        name: event.name,
        result: dispatchResult.result,
      });
      return;
    }

    observe("voice.tool.invocation.failed", {
      level: dispatchResult.code === "timeout" ? "warn" : "error",
      fields: {
        tool_call_id: event.callId,
        tool_request_id: dispatchResult.requestId,
        tool_name: event.name,
        duration_ms: dispatchResult.durationMs,
        code: dispatchResult.code,
      },
    });
    setToolState({
      status: dispatchResult.code === "timeout" ? "timed_out" : "failed",
      name: event.name,
      summary: dispatchResult.message,
      output:
        dispatchResult.code === "timeout"
          ? "The tool timed out before PersonaFlow could return phrase-card previews."
          : "The tool request failed before any phrase-card preview could be returned.",
      callId: event.callId,
    });
    setSessionError(dispatchResult.message);
    setAssistantOutput("The phrase-card preview did not finish. Retry the turn to recover.");
    clientRef.current?.sendToolError({
      callId: event.callId,
      name: event.name,
      message: dispatchResult.message,
      code: dispatchResult.code,
    });
  }

  function teardownTransport() {
    clearReconnectTimer();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    clientRef.current?.disconnect();
    clientRef.current = null;
    inputChunkCountRef.current = 0;
    void audioRef.current?.stopInput();
    audioRef.current?.flushPlayback();
  }

  function scheduleReconnect(reason: string) {
    if (manualDisconnectRef.current || isEnding || reconnectTimerRef.current !== null) {
      return false;
    }

    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      return false;
    }

    reconnectAttemptRef.current += 1;
    shouldAutoStartTurnRef.current = false;
    markTranscriptPartial("The turn was interrupted before the transcript fully settled.");
    teardownTransport();
    observe("voice.reconnect.scheduled", {
      level: "warn",
      fields: {
        reason,
        reconnect_attempt: reconnectAttemptRef.current,
      },
    });
    dispatchIfValid({
      type: "reconnect.request",
      attempt: reconnectAttemptRef.current,
      reason,
    });
    setSessionError(
      `${reason} Reconnecting automatically (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS}).`,
    );
    appendLocalEvent(
      "Recovery",
      `Reconnect scheduled after a recoverable live-session failure: ${reason}`,
    );

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      handleStartConnection({ reconnect: true });
    }, RECONNECT_DELAY_MS);

    return true;
  }

  async function interruptCurrentTurn({
    restartTurn = false,
  }: {
    restartTurn?: boolean;
  } = {}) {
    if (connectionState !== "connected") {
      return;
    }

    const currentStatus = voiceStateRef.current.status;
    if (!isTurnActive(currentStatus) && currentStatus !== "interrupted") {
      return;
    }

    shouldAutoStartTurnRef.current = false;
    clientRef.current?.sendClientEvent({
      kind: "response.cancel",
      text: "Client requested immediate playback interruption.",
    });
    observe("voice.turn.interrupted", {
      level: "warn",
      fields: {
        interrupted_from: currentStatus,
        restart_turn: restartTurn,
      },
    });
    await audioRef.current?.stopInput();
    audioRef.current?.flushPlayback();
    appendLocalEvent("Recovery", "Current playback was interrupted intentionally.");
    markTranscriptPartial("The current spoken turn was interrupted before it completed.");

    if (currentStatus !== "interrupted") {
      dispatchIfValid({ type: "interruption" });
    }

    dispatchIfValid({ type: "interruption.recovered" });
    setAssistantOutput("Playback stopped. Start the turn again when you are ready.");
    setSessionError(null);

    if (restartTurn) {
      handleStartTurn();
    }
  }

  async function handleRealtimeEvent(event: RealtimeSessionEvent) {
    appendEvent(event);

    if (event.type === "connected") {
      providerConnectionIdRef.current = event.connectionId;
      observe("voice.provider.connection.connected", {
        fields: {
          provider_connection_id: event.connectionId,
        },
      });
      clearReconnectTimer();
      setSessionError(null);
      if (voiceStateRef.current.status !== "connected") {
        dispatchIfValid({ type: "connected" });
      }

      if (reconnectAttemptRef.current > 0) {
        setAssistantOutput("Connection recovered. Run the demo turn again.");
      }
      reconnectAttemptRef.current = 0;
      return;
    }

    if (event.type === "transcript.received") {
      if (event.speaker === "agent") {
        setAssistantOutput(event.text);
        void persistTranscriptEntry("agent", event.text, "en");
      } else if (event.speaker === "user") {
        setTranscriptHealth({
          status: "complete",
          summary: "The latest user turn was captured and saved for recovery.",
        });
        void persistTranscriptEntry("user", event.text, "ja");
      }
      return;
    }

    if (event.type === "response.audio") {
      if (voiceStateRef.current.status === "thinking") {
        dispatchIfValid({ type: "response.started" });
      }

      try {
        await audioRef.current?.pushPlaybackChunk(event.chunk);
      } catch {
        setSessionError("Unable to play the assistant audio for this demo turn.");
        dispatchIfValid({
          type: "recoverable.error",
          message: "Unable to play the assistant audio for this demo turn.",
        });
      }
      return;
    }

    if (event.type === "tool.call.requested") {
      if (voiceStateRef.current.status === "thinking") {
        dispatchIfValid({ type: "tool.call.started" });
      }
      void handleToolCall(event);
      return;
    }

    if (event.type === "tool.result.received") {
      if (voiceStateRef.current.status === "tool_running") {
        dispatchIfValid({ type: "tool.call.finished" });
      }
      return;
    }

    if (event.type === "tool.error.received") {
      if (voiceStateRef.current.status === "tool_running") {
        dispatchIfValid({ type: "tool.call.finished" });
      }
      observe("voice.tool.result.error", {
        level: "warn",
        fields: {
          tool_call_id: event.callId,
          tool_name: event.name,
          code: event.code,
        },
      });
      setSessionError(event.message);
      return;
    }

    if (event.type === "recoverable.error") {
      setSessionError(event.message);
      if (!scheduleReconnect(event.message)) {
        dispatchIfValid({
          type: "recoverable.error",
          message: event.message,
        });
      } else {
        observe("voice.error.recoverable", {
          level: "warn",
          fields: {
            message: event.message,
          },
        });
      }
      return;
    }

    if (event.type === "fatal.error") {
      setSessionError(event.message);
      markTranscriptPartial("The live session failed before the current turn completed.");
      dispatchIfValid({
        type: "fatal.error",
        message: event.message,
      });
      return;
    }

    if (event.type === "session.closed") {
      observe("voice.provider.connection.closed", {
        level: event.reason === "remote" ? "warn" : "info",
        fields: {
          reason: event.reason,
          provider_connection_id: event.connectionId,
        },
      });
      if (event.reason === "remote" && scheduleReconnect("The provider closed the live session.")) {
        return;
      }

      dispatchIfValid({
        type: "disconnect",
        reason: event.reason === "client" ? "client" : "remote",
      });
    }
  }

  function handleStartConnection(options: StartConnectionOptions = {}) {
    if (!options.reconnect && !canStart) {
      return;
    }

    teardownTransport();
    manualDisconnectRef.current = false;
    connectionAttemptIdRef.current = crypto.randomUUID();
    providerConnectionIdRef.current = null;
    observe("voice.provider.connection.start", {
      fields: {
        reconnect: options.reconnect ?? false,
        reconnect_attempt: reconnectAttemptRef.current,
      },
    });

    if (options.reconnect) {
      setAssistantOutput("Recovering live connection. Retry the turn once the session is ready.");
      setSessionError(
        `Retrying live connection (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS}).`,
      );
      shouldAutoStartTurnRef.current = false;
    } else {
      reconnectAttemptRef.current = 0;
      shouldAutoStartTurnRef.current = true;
      transcriptTurnIndexRef.current = 0;
      setEventFeed([]);
      setToolState(initialToolState);
      setAssistantOutput("Waiting for the live session to start.");
      setSessionError(null);
      setTranscriptSaveError(null);
      setTranscriptHealth(initialTranscriptHealth);
      dispatchIfValid({ type: "connect.request" });
    }

    const client = createGeminiLiveClient({
      sessionId,
      apiBaseUrl: API_BASE_URL,
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        observe("voice.provider.connection.state_changed", {
          level: state === "failed" ? "warn" : "info",
          fields: {
            state,
          },
        });
      },
    });

    unsubscribeRef.current = client.subscribe((event) => {
      void handleRealtimeEvent(event);
    });
    clientRef.current = client;
    client.connect();
  }

  function handleStartTurn() {
    if (connectionState !== "connected" || voiceStateRef.current.status !== "connected") {
      return;
    }

    resetTurnCycle();
    dispatchIfValid({ type: "mic.start" });
  }

  function handleRetryTurn() {
    if (connectionState !== "connected") {
      return;
    }

    if (voiceStateRef.current.status === "connected") {
      handleStartTurn();
      return;
    }

    void interruptCurrentTurn({ restartTurn: true });
  }

  function handleStopConnection() {
    manualDisconnectRef.current = true;
    shouldAutoStartTurnRef.current = false;
    markTranscriptPartial("The current turn was stopped before completion.");
    observe("voice.session.stop", {
      fields: {
        reason: "client_stop",
      },
    });
    teardownTransport();
    setConnectionState("ended");
    setSessionError(null);
    dispatchIfValid({ type: "disconnect", reason: "client" });
  }

  async function handleEndSession() {
    if (isEnding) {
      return;
    }

    setCompletionError(null);
    setViewState("processing");
    manualDisconnectRef.current = true;
    shouldAutoStartTurnRef.current = false;
    observe("voice.session.stop", {
      fields: {
        reason: "session_end",
      },
    });
    teardownTransport();

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to end a session right now.");
      }

      const payload = (await response.json()) as SessionCompletionResponse;
      observe("voice.session.stop.completed", {
        fields: {
          completed_at: payload.completed_at,
        },
      });
      router.push(
        `/session/${payload.session_id}/results?completedAt=${encodeURIComponent(payload.completed_at)}`,
      );
    } catch (error) {
      observe("voice.session.stop.failed", {
        level: "error",
        fields: {
          message: error instanceof Error ? error.message : "Unable to end the session right now.",
        },
      });
      setViewState("live");
      setCompletionError(
        error instanceof Error
          ? error.message
          : "Unable to end the session right now.",
      );
    }
  }

  useEffect(() => {
    if (!realtimeVoiceEnabled) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    observe("voice.session.start", {
      fields: {
        started_at: startedAt,
      },
    });

    return () => {
      observe("voice.session.view_closed", { store: false });
    };
  }, []);

  useEffect(() => {
    audioRef.current = createAudioIO({
      mode: audioMode,
      callbacks: {
        onInputChunk: (chunk) => {
          clientRef.current?.sendUserAudio(chunk);

          if (voiceStateRef.current.status !== "listening") {
            return;
          }

          inputChunkCountRef.current += 1;
          if (inputChunkCountRef.current === 1) {
            dispatchIfValid({ type: "speech.detected" });
          }

          if (inputChunkCountRef.current >= 6) {
            void audioRef.current?.stopInput();
          }
        },
        onPlaybackStateChange: (playing) => {
          if (!playing && voiceStateRef.current.status === "speaking") {
            dispatchIfValid({ type: "response.ended" });
          }
        },
      },
    });

    return () => {
      manualDisconnectRef.current = true;
      teardownTransport();
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [audioMode]);

  useEffect(() => {
    if (
      shouldAutoStartTurnRef.current &&
      connectionState === "connected" &&
      voiceState.status === "connected"
    ) {
      shouldAutoStartTurnRef.current = false;
      handleStartTurn();
    }
  }, [connectionState, voiceState.status]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (voiceState.status === "listening") {
      inputChunkCountRef.current = 0;
      void audio.startInput().catch(() => {
        setSessionError("Unable to start audio input for the realtime demo.");
        dispatchIfValid({
          type: "recoverable.error",
          message: "Unable to start audio input for the realtime demo.",
        });
      });
      return;
    }

    void audio.stopInput().catch(() => {
      setSessionError("Unable to stop audio input cleanly for the realtime demo.");
      dispatchIfValid({
        type: "recoverable.error",
        message: "Unable to stop audio input cleanly for the realtime demo.",
      });
    });

    if (voiceState.status !== "speaking") {
      audio.flushPlayback();
    }
  }, [voiceState.status]);

  if (viewState === "processing") {
    return (
      <main className="session-shell">
        <section className="live-session-card processing-card">
          <p className="eyebrow">Post-session</p>
          <h1 className="session-title">Wrapping up your session.</h1>
          <p className="lede processing-copy">
            Ending the live session and preparing the initial review screen.
          </p>
          <div className="processing-details" aria-live="polite">
            <p className="session-status-label">Session status</p>
            <p className="session-status-value">Processing</p>
            <p className="session-meta">
              The results screen will open automatically when the request completes.
            </p>
          </div>
          <div className="session-actions session-actions-start">
            <button className="start-button" type="button" disabled>
              Processing...
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="session-shell">
      <section className="live-session-card">
        <header className="live-session-header">
          <div>
            <p className="eyebrow">Live session</p>
            <h1 className="session-title">Watch one spoken moment become a phrase-card preview.</h1>
            <p className="lede">
              The learner speaks naturally, PersonaFlow captures the moment, runs one visible tool,
              and answers with a reusable English expression that keeps the learner&apos;s tone.
            </p>
          </div>
          <div className="session-status-block" aria-live="polite">
            <p className="session-status-label">Now</p>
            <p className="session-status-value">{nowCopy.title}</p>
            <p className="session-meta">Started {startedAtLabel}</p>
            <p className="session-meta">{nowCopy.body}</p>
            <p className="session-meta">Next: {nextStepCopy}</p>
            {voiceState.status === "reconnecting" ? (
              <p className="session-meta">
                Attempt {voiceState.attempt} of {MAX_RECONNECT_ATTEMPTS}: {voiceState.reason}
              </p>
            ) : null}
          </div>
        </header>

        {voiceState.status === "error" ? (
          <div className="voice-error-banner" role="alert">
            <div>
              <p className="panel-label">
                {voiceState.recoverable ? "Recoverable error" : "Fatal error"}
              </p>
              <p className="voice-error-title">{voiceState.message}</p>
              <p className="voice-status-copy">
                Retry the live connection to return to the same demo scenario.
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={() => handleStartConnection()}>
              Retry connection
            </button>
          </div>
        ) : null}

        {voiceState.status === "reconnecting" ? (
          <div className="voice-recovery-banner" role="status" aria-live="polite">
            <div>
              <p className="panel-label">Recovering live session</p>
              <p className="voice-error-title">{voiceState.reason}</p>
              <p className="voice-status-copy">
                PersonaFlow is reopening the session automatically. If it stalls, trigger a retry
                manually.
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleStartConnection({ reconnect: true })}
            >
              Reconnect now
            </button>
          </div>
        ) : null}

        {voiceState.status === "disconnected" && voiceState.reason !== "client" ? (
          <div className="voice-recovery-banner" role="alert">
            <div>
              <p className="panel-label">Disconnected</p>
              <p className="voice-error-title">
                {voiceState.reason === "provider_error"
                  ? "The provider connection failed."
                  : "The live session closed unexpectedly."}
              </p>
              <p className="voice-status-copy">
                Retry the connection to get back to a usable demo state.
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={() => handleStartConnection()}>
              Retry connection
            </button>
          </div>
        ) : null}

        <section className="session-panels voice-session-layout" aria-label="Live session details">
          <div className="session-panel">
            <div className="live-status-hero">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Current assistant state</p>
                  <p className="transcript-subtitle">
                    The primary demo story stays here so judges can read the session at a glance.
                  </p>
                </div>
                <p className={`voice-phase-pill voice-phase-pill-${liveStatusTone}`}>
                  {voiceStateCopy[voiceState.status]}
                </p>
              </div>

              <div className={`live-status-callout live-status-callout-${liveStatusTone}`}>
                <span
                  className={`mic-indicator mic-indicator-${connectionState}`}
                  aria-hidden="true"
                />
                <div>
                  <p className="mic-status-title">{nowCopy.title}</p>
                  <p className="mic-status-copy">{nowCopy.body}</p>
                </div>
              </div>

              <div className="live-status-metrics">
                <article className="live-status-metric">
                  <p className="session-status-label">Connection</p>
                  <p className="session-status-value">{formatStatusLabel(connectionState)}</p>
                </article>
                <article className="live-status-metric">
                  <p className="session-status-label">Voice state</p>
                  <p className="session-status-value">{formatStatusLabel(voiceState.status)}</p>
                </article>
                <article className="live-status-metric">
                  <p className="session-status-label">Audio mode</p>
                  <p className="session-status-value">{audioMode}</p>
                </article>
              </div>
            </div>

            <div className="transport-actions">
              <button
                className="start-button"
                type="button"
                onClick={() => handleStartConnection()}
                disabled={!canStart}
              >
                {connectionState === "connecting"
                  ? "Connecting..."
                  : voiceState.status === "disconnected" || voiceState.status === "error"
                    ? "Retry Live Connection"
                    : "Start Live Connection"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleRetryTurn}
                disabled={!canRetryTurn}
              >
                {voiceState.status === "connected"
                  ? "Run Demo Turn Again"
                  : "Interrupt and Retry Turn"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void interruptCurrentTurn();
                }}
                disabled={
                  connectionState !== "connected" ||
                  (voiceState.status !== "speaking" &&
                    voiceState.status !== "thinking" &&
                    voiceState.status !== "tool_running")
                }
              >
                Interrupt Playback
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleStopConnection}
                disabled={!canStop}
              >
                Stop Connection
              </button>
            </div>

            <div className="tool-status-panel assistant-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Assistant reply</p>
                  <p className="transcript-subtitle">
                    The spoken response updates here after the tool completes.
                  </p>
                </div>
                <p className="voice-phase-pill">Live reply</p>
              </div>
              <div className="voice-tool-result">
                <p className="voice-tool-summary">
                  {latestAssistantEntry
                    ? "Latest assistant response"
                    : "No assistant reply yet. Start the connection and let the turn complete."}
                </p>
                <pre className="tool-output">{assistantOutput}</pre>
              </div>
            </div>

            <div className="tool-status-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Tool activity</p>
                  <p className="transcript-subtitle">
                    One PersonaFlow phrase-card tool runs inside the live session and feeds the reply.
                  </p>
                </div>
                <p className={`voice-tool-badge voice-tool-${toolState.status}`}>
                  {toolState.status === "idle" ? "Waiting" : toolState.status.replace("_", " ")}
                </p>
              </div>
              <div className="voice-tool-block">
                <p className="voice-tool-name">
                  {toolState.name === PHRASE_CARD_TOOL_NAME
                    ? "Phrase card preview"
                    : toolState.name}
                </p>
                <p className="voice-tool-summary">{toolState.summary}</p>
              </div>
              <div className="voice-tool-result">
                <p className="panel-label">Phrase-card preview</p>
                <pre className="tool-output">{toolState.output}</pre>
              </div>
              <div className="tool-activity-feed">
                {toolHistoryEntries.length > 0 ? (
                  toolHistoryEntries.slice(-3).reverse().map((entry) => (
                    <article
                      className={`tool-activity-entry tool-activity-entry-${entry.kind}`}
                      key={entry.id}
                    >
                      <p className="transcript-speaker">{entry.label}</p>
                      <p className="transcript-text">{entry.text}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-inline-state">
                    <p className="transcript-speaker">No tool activity yet</p>
                    <p className="transcript-text">
                      Once the learner turn is captured, the phrase-card preview call will show up
                      here.
                    </p>
                  </div>
                )}
              </div>
              {toolState.status === "failed" || toolState.status === "timed_out" ? (
                <div className="voice-recovery-actions">
                  <button className="secondary-button" type="button" onClick={handleRetryTurn}>
                    Retry this turn
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="session-panel transcript-panel">
            <div className="transcript-header">
              <div>
                <p className="panel-label">Transcript and session feed</p>
                <p className="transcript-subtitle">
                  Learner speech, assistant speech, tool activity, and recoverable issues are visually separated.
                </p>
              </div>
              <p className="transcript-session-id">Session started {startedAtLabel}</p>
            </div>

            <div className="transcript-overview-grid">
              <div className="transcript-health-panel">
                <div>
                  <p className="panel-label">Transcript health</p>
                  <p className="mic-status-title">{formatStatusLabel(transcriptHealth.status)}</p>
                  <p className="mic-status-copy">{transcriptHealth.summary}</p>
                </div>
                {transcriptHealth.status === "partial" ? (
                  <button className="secondary-button" type="button" onClick={handleRetryTurn}>
                    Recover turn
                  </button>
                ) : null}
              </div>

              <div className="transcript-snapshot-grid">
                <article className="transcript-snapshot transcript-snapshot-user">
                  <p className="transcript-speaker">Latest learner turn</p>
                  <p className="transcript-text">
                    {latestUserEntry?.text ??
                      "No learner transcript yet. Start the connection to capture the first spoken turn."}
                  </p>
                </article>
                <article className="transcript-snapshot transcript-snapshot-assistant">
                  <p className="transcript-speaker">Latest assistant turn</p>
                  <p className="transcript-text">
                    {latestAssistantEntry?.text ??
                      "No assistant reply yet. It will appear after the tool result returns."}
                  </p>
                </article>
              </div>
            </div>

            <div className="transcript-feed" aria-live="polite">
              {eventFeed.length > 0 ? (
                eventFeed.map((entry) => (
                  <article
                    className={`transcript-entry transcript-entry-${entry.kind}`}
                    key={entry.id}
                  >
                    <div className="transcript-entry-header">
                      <p className="transcript-speaker">{entry.speaker}</p>
                      <p className={`voice-tool-badge voice-tool-${entry.kind}`}>{entry.label}</p>
                    </div>
                    <p className="transcript-text">{entry.text}</p>
                  </article>
                ))
              ) : (
                <div className="empty-feed">
                  <p className="transcript-speaker">No live activity yet</p>
                  <p className="transcript-text">
                    Start the connection to show the learner turn, tool invocation, and assistant
                    reply in one place.
                  </p>
                </div>
              )}
            </div>
          </div>

          {debugEnabled ? (
            <div className="session-panel transcript-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Debug events</p>
                  <p className="transcript-subtitle">
                    Structured development logs for session lifecycle, transport recovery, and
                    tool execution.
                  </p>
                </div>
                <p className="transcript-session-id">Recent {debugEvents.length}</p>
              </div>

              <div className="transcript-feed debug-feed" aria-live="polite">
                {debugEvents.length > 0 ? (
                  debugEvents
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <article className="transcript-entry debug-entry" key={entry.id}>
                        <div className="debug-entry-header">
                          <p className="transcript-speaker">{entry.event}</p>
                          <p className={`voice-tool-badge voice-tool-${entry.level}`}>
                            {entry.level}
                          </p>
                        </div>
                        <p className="transcript-text debug-entry-meta">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </p>
                        <pre className="tool-output debug-entry-fields">
                          {JSON.stringify(entry.fields, null, 2)}
                        </pre>
                      </article>
                    ))
                ) : (
                  <div className="empty-feed">
                    <p className="transcript-speaker">No debug events yet</p>
                    <p className="transcript-text">
                      Add <code>?debug=1</code> and start the live connection to inspect the event
                      trail.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <div className="session-footer">
          {visibleErrors.length > 0 ? (
            <div className="session-alert-stack" role="status" aria-live="polite">
              {visibleErrors.map((error, index) => (
                <p className="error-note error-note-card" key={`${error}-${index}`}>
                  {error}
                </p>
              ))}
            </div>
          ) : (
            <p className="session-footer-note">
              This demo stays focused on one clear moment: spoken input, tool handoff, and phrase-card-informed reply.
            </p>
          )}
          <div className="session-actions">
            <button
              className="end-session-button"
              type="button"
              onClick={handleEndSession}
              disabled={isEnding}
            >
              End Session
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
