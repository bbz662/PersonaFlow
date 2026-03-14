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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const statusCopy: Record<RealtimeConnectionState, string> = {
  connecting: "Opening the Gemini Live session.",
  connected: "Gemini Live is active and ready for the next spoken turn.",
  failed: "The Gemini Live session could not connect. Retry the demo session.",
  ended: "The Gemini Live session is not active.",
};

const voiceStateCopy: Record<VoiceSessionState["status"], string> = {
  idle: "Ready to connect",
  connecting: "Connecting live session",
  connected: "Connected and waiting for a turn",
  listening: "Listening to the learner",
  thinking: "Preparing the tool handoff",
  tool_running: "Running phrase-card preview",
  speaking: "Playing the assistant reply",
  interrupted: "Session interrupted",
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

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function buildFeedEntry(event: RealtimeSessionEvent, index: number): EventFeedEntry {
  switch (event.type) {
    case "connected":
      return {
        id: `connected-${index}`,
        speaker: "Session",
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
        text: event.text,
      };

    case "response.audio":
      return {
        id: `audio-${index}`,
        speaker: "Audio",
        text: `Assistant playback received ${event.chunk.samples.length} audio samples.`,
      };

    case "tool.call.requested":
      return {
        id: `tool-${index}`,
        speaker: "Tool request",
        text: `${event.name} requested by Gemini Live.`,
      };

    case "tool.result.received":
      return {
        id: `tool-result-${index}`,
        speaker: "Tool result",
        text: `${event.name} returned structured data to the live session.`,
      };

    case "tool.error.received":
      return {
        id: `tool-error-${index}`,
        speaker: "Tool error",
        text: `${event.name} failed: ${event.message}`,
      };

    case "session.closed":
      return {
        id: `closed-${index}`,
        speaker: "Session",
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
        text: event.message,
      };
  }
}

function resolveAudioMode(searchParams: ReturnType<typeof useSearchParams>): AudioIOMode {
  return searchParams.get("audio") === "browser" ? "browser" : defaultRealtimeAudioMode;
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
  const inputChunkCountRef = useRef(0);
  const transcriptTurnIndexRef = useRef(0);
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

  const sessionId = params.sessionId;
  const audioMode = resolveAudioMode(searchParams);
  const startedAt = searchParams.get("startedAt");
  const startedAtLabel = startedAt ? new Date(startedAt).toLocaleString() : "Just now";
  const canStart = connectionState === "ended" || connectionState === "failed";
  const canStop =
    connectionState === "connecting" || connectionState === "connected";
  const isEnding = viewState === "processing";

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  function dispatchIfValid(event: VoiceSessionEvent) {
    const currentState = voiceStateRef.current;
    const status = currentState.status;

    if (
      (event.type === "connect.request" &&
        !["idle", "disconnected", "interrupted", "error"].includes(status)) ||
      (event.type === "connected" && status !== "connecting") ||
      (event.type === "mic.start" && status !== "connected") ||
      (event.type === "mic.stop" && status !== "listening") ||
      (event.type === "speech.detected" && status !== "listening") ||
      (event.type === "tool.call.started" && status !== "thinking") ||
      (event.type === "tool.call.finished" && status !== "tool_running") ||
      (event.type === "response.started" && status !== "thinking") ||
      (event.type === "response.ended" && status !== "speaking") ||
      (event.type === "interruption" &&
        ![
          "connecting",
          "connected",
          "listening",
          "thinking",
          "speaking",
          "tool_running",
        ].includes(status)) ||
      (event.type === "disconnect" && status === "disconnected")
    ) {
      return;
    }

    voiceStateRef.current = voiceSessionReducer(currentState, event);
    dispatchVoiceState(event);
  }

  function appendEvent(event: RealtimeSessionEvent) {
    setEventFeed((current) => [...current, buildFeedEntry(event, current.length)]);
  }

  function resetTurnCycle() {
    inputChunkCountRef.current = 0;
    setToolState(initialToolState);
    setAssistantOutput("Listening for the next spoken turn.");
    setSessionError(null);
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
    });

    if (dispatchResult.status === "completed") {
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
    clientRef.current?.sendToolError({
      callId: event.callId,
      name: event.name,
      message: dispatchResult.message,
      code: dispatchResult.code,
    });
  }

  async function handleRealtimeEvent(event: RealtimeSessionEvent) {
    appendEvent(event);

    if (event.type === "connected") {
      dispatchIfValid({ type: "connected" });
      return;
    }

    if (event.type === "transcript.received") {
      if (event.speaker === "agent") {
        setAssistantOutput(event.text);
        void persistTranscriptEntry("agent", event.text, "en");
      } else if (event.speaker === "user") {
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

    if (event.type === "tool.result.received" || event.type === "tool.error.received") {
      if (voiceStateRef.current.status === "tool_running") {
        dispatchIfValid({ type: "tool.call.finished" });
      }
      return;
    }

    if (event.type === "recoverable.error" || event.type === "fatal.error") {
      setSessionError(event.message);
      dispatchIfValid({
        type: event.type,
        message: event.message,
      });
      return;
    }

    if (event.type === "session.closed") {
      dispatchIfValid({ type: "disconnect" });
    }
  }

  function disconnectTransport() {
    unsubscribeRef.current?.();
    clientRef.current?.disconnect();
    unsubscribeRef.current = null;
    clientRef.current = null;
    inputChunkCountRef.current = 0;
    void audioRef.current?.stopInput();
    audioRef.current?.flushPlayback();
  }

  function handleStartConnection() {
    if (!canStart) {
      return;
    }

    disconnectTransport();
    shouldAutoStartTurnRef.current = true;
    transcriptTurnIndexRef.current = 0;
    setEventFeed([]);
    setToolState(initialToolState);
    setAssistantOutput("Waiting for the live session to start.");
    setSessionError(null);
    setTranscriptSaveError(null);
    dispatchIfValid({ type: "connect.request" });

    const client = createGeminiLiveClient({
      sessionId,
      apiBaseUrl: API_BASE_URL,
      onConnectionStateChange: setConnectionState,
    });

    unsubscribeRef.current = client.subscribe((event) => {
      void handleRealtimeEvent(event);
    });
    clientRef.current = client;
    client.connect();
  }

  function handleStartTurn() {
    if (connectionState !== "connected" || voiceState.status !== "connected") {
      return;
    }

    resetTurnCycle();
    dispatchIfValid({ type: "mic.start" });
  }

  function handleStopConnection() {
    shouldAutoStartTurnRef.current = false;
    disconnectTransport();
    setConnectionState("ended");
    dispatchIfValid({ type: "disconnect" });
  }

  async function handleEndSession() {
    if (isEnding) {
      return;
    }

    setCompletionError(null);
    setViewState("processing");
    shouldAutoStartTurnRef.current = false;
    disconnectTransport();

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to end a session right now.");
      }

      const payload = (await response.json()) as SessionCompletionResponse;
      router.push(
        `/session/${payload.session_id}/results?completedAt=${encodeURIComponent(payload.completed_at)}`,
      );
    } catch (error) {
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
      disconnectTransport();
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
            <h1 className="session-title">One spoken phrase-card scenario.</h1>
          </div>
          <div className="session-status-block" aria-live="polite">
            <p className="session-status-label">Connection state</p>
            <p className="session-status-value">{formatStatusLabel(connectionState)}</p>
            <p className="session-meta">Started {startedAtLabel}</p>
            <p className="session-meta">
              Voice state: {voiceStateCopy[voiceState.status]}. Audio mode: {audioMode}.
            </p>
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
                Retry the live connection to run the same primary spoken scenario again.
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={handleStartConnection}>
              Retry connection
            </button>
          </div>
        ) : null}

        <section className="session-panels" aria-label="Live session details">
          <div className="session-panel">
            <p className="panel-label">Gemini Live</p>
            <div className="mic-status">
              <span
                className={`mic-indicator mic-indicator-${connectionState}`}
                aria-hidden="true"
              />
              <div>
                <p className="mic-status-title">{voiceStateCopy[voiceState.status]}</p>
                <p className="mic-status-copy">{statusCopy[connectionState]}</p>
              </div>
            </div>

            <div className="transport-actions">
              <button
                className="start-button"
                type="button"
                onClick={handleStartConnection}
                disabled={!canStart}
              >
                {connectionState === "connecting" ? "Connecting..." : "Start Live Connection"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleStartTurn}
                disabled={connectionState !== "connected" || voiceState.status !== "connected"}
              >
                Run Demo Turn Again
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

            <div className="tool-status-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Assistant output</p>
                  <p className="transcript-subtitle">
                    The final assistant reply reflects the live tool result for this single demo
                    slice.
                  </p>
                </div>
                <p className="voice-phase-pill">{voiceState.status.replace("_", " ")}</p>
              </div>
              <div className="voice-tool-result">
                <pre className="tool-output">{assistantOutput}</pre>
              </div>
            </div>

            <div className="tool-status-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Tool bridge</p>
                  <p className="transcript-subtitle">
                    One PersonaFlow phrase-card tool is exposed inside the live session.
                  </p>
                </div>
                <p className={`voice-tool-badge voice-tool-${toolState.status}`}>
                  {toolState.status.replace("_", " ")}
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
                <p className="panel-label">Result</p>
                <pre className="tool-output">{toolState.output}</pre>
              </div>
            </div>
          </div>

          <div className="session-panel transcript-panel">
            <div className="transcript-header">
              <div>
                <p className="panel-label">Session events</p>
                <p className="transcript-subtitle">
                  Spoken input, transcript events, tool activity, and assistant output all land
                  here.
                </p>
              </div>
              <p className="transcript-session-id">Session {sessionId}</p>
            </div>

            <div className="transcript-feed" aria-live="polite">
              {eventFeed.length > 0 ? (
                eventFeed.map((entry) => (
                  <article className="transcript-entry" key={entry.id}>
                    <p className="transcript-speaker">{entry.speaker}</p>
                    <p className="transcript-text">{entry.text}</p>
                  </article>
                ))
              ) : (
                <div className="empty-feed">
                  <p className="transcript-speaker">No live events yet</p>
                  <p className="transcript-text">
                    Start the connection to run the spoken phrase-card scenario.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="session-actions">
          {sessionError ? <p className="error-note">{sessionError}</p> : null}
          {transcriptSaveError ? <p className="error-note">{transcriptSaveError}</p> : null}
          {completionError ? <p className="error-note">{completionError}</p> : null}
          <button
            className="end-session-button"
            type="button"
            onClick={handleEndSession}
            disabled={isEnding}
          >
            End Session
          </button>
        </div>
      </section>
    </main>
  );
}
