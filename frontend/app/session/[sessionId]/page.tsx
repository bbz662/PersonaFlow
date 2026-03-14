"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { createGeminiLiveClient } from "../../../lib/gemini-live-client";
import {
  PersonaFlowToolBridge,
  PHRASE_CARD_TOOL_NAME,
  type PhraseCardPreviewResult,
} from "../../../lib/personaflow-tool-bridge";
import type {
  RealtimeConnectionState,
  RealtimeSessionClient,
  RealtimeSessionEvent,
  RealtimeToolCallEvent,
} from "../../../lib/realtime-session-client";

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
  connected: "Gemini Live is active and ready for session events.",
  failed: "The Gemini Live session could not connect. Try starting again.",
  ended: "The Gemini Live session is not active.",
};

const initialToolState: ToolPanelState = {
  status: "idle",
  name: "Phrase card preview",
  summary: "Waiting for a tool request from the live session.",
  output: "No tool run yet.",
  callId: null,
};

function formatStatusLabel(status: RealtimeConnectionState) {
  return status.charAt(0).toUpperCase() + status.slice(1);
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
        speaker: "PersonaFlow audio",
        text: `Received ${event.chunk.samples.length} audio samples from the model output.`,
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

export default function LiveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientRef = useRef<RealtimeSessionClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const toolBridgeRef = useRef(new PersonaFlowToolBridge());
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("ended");
  const [eventFeed, setEventFeed] = useState<EventFeedEntry[]>([]);
  const [viewState, setViewState] = useState<SessionViewState>("live");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [utteranceText, setUtteranceText] = useState(
    "Turn this into a phrase card: I stayed in, made curry, and talked with my sister for hours.",
  );
  const [utteranceError, setUtteranceError] = useState<string | null>(null);
  const [toolState, setToolState] = useState<ToolPanelState>(initialToolState);
  const [nextTurnIndex, setNextTurnIndex] = useState(0);

  const sessionId = params.sessionId;
  const startedAt = searchParams.get("startedAt");
  const startedAtLabel = startedAt
    ? new Date(startedAt).toLocaleString()
    : "Just now";

  const canStart = connectionState === "ended" || connectionState === "failed";
  const canStop =
    connectionState === "connecting" || connectionState === "connected";
  const isEnding = viewState === "processing";

  const statusDescription = useMemo(() => {
    return statusCopy[connectionState];
  }, [connectionState]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      clientRef.current?.disconnect();
      unsubscribeRef.current = null;
      clientRef.current = null;
    };
  }, []);

  function appendEvent(event: RealtimeSessionEvent) {
    setEventFeed((current) => [...current, buildFeedEntry(event, current.length)]);
  }

  function buildToolOutput(result: PhraseCardPreviewResult) {
    if (result.cards.length === 0) {
      return result.summary;
    }

    return result.cards
      .slice(0, 2)
      .map(
        (card, index) =>
          `${index + 1}. ${card.english_expression} (${card.tone_tag})`,
      )
      .join("\n");
  }

  async function handleToolCall(event: RealtimeToolCallEvent) {
    setToolState({
      status: "running",
      name: event.name,
      summary: "PersonaFlow is generating phrase card previews from the latest utterance.",
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
          ? "The tool hit the live-session timeout before PersonaFlow could return previews."
          : "The tool request failed before any phrase card preview could be returned.",
      callId: event.callId,
    });
    clientRef.current?.sendToolError({
      callId: event.callId,
      name: event.name,
      message: dispatchResult.message,
      code: dispatchResult.code,
    });
  }

  function handleRealtimeEvent(event: RealtimeSessionEvent) {
    appendEvent(event);

    if (event.type === "tool.call.requested") {
      void handleToolCall(event);
    }
  }

  function handleStartConnection() {
    if (!canStart) {
      return;
    }

    unsubscribeRef.current?.();
    clientRef.current?.disconnect();
    setEventFeed([]);
    setToolState(initialToolState);
    setUtteranceError(null);

    const client = createGeminiLiveClient({
      sessionId,
      apiBaseUrl: API_BASE_URL,
      onConnectionStateChange: setConnectionState,
    });

    unsubscribeRef.current = client.subscribe(handleRealtimeEvent);
    clientRef.current = client;
    client.connect();
  }

  function handleStopConnection() {
    clientRef.current?.disconnect();
  }

  function handleSendUtterance() {
    const trimmed = utteranceText.trim();
    if (!trimmed) {
      setUtteranceError("Enter a learner utterance before sending it into the live session.");
      return;
    }

    if (connectionState !== "connected") {
      setUtteranceError("Connect the live session before sending a learner utterance.");
      return;
    }

    setUtteranceError(null);
    clientRef.current?.sendUserTranscript({
      text: trimmed,
      language: "ja",
      turnIndex: nextTurnIndex,
    });
    setNextTurnIndex((current) => current + 1);
  }

  async function handleEndSession() {
    if (isEnding) {
      return;
    }

    setCompletionError(null);
    setViewState("processing");
    unsubscribeRef.current?.();
    clientRef.current?.disconnect();
    unsubscribeRef.current = null;
    clientRef.current = null;

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
            <h1 className="session-title">Stay in the conversation.</h1>
          </div>
          <div className="session-status-block" aria-live="polite">
            <p className="session-status-label">Connection state</p>
            <p className="session-status-value">{formatStatusLabel(connectionState)}</p>
            <p className="session-meta">Started {startedAtLabel}</p>
            <p className="session-meta">{statusDescription}</p>
          </div>
        </header>

        <section className="session-panels" aria-label="Live session details">
          <div className="session-panel">
            <p className="panel-label">Gemini Live</p>
            <div className="mic-status">
              <span
                className={`mic-indicator mic-indicator-${connectionState}`}
                aria-hidden="true"
              />
              <div>
                <p className="mic-status-title">{formatStatusLabel(connectionState)}</p>
                <p className="mic-status-copy">{statusDescription}</p>
              </div>
            </div>

            <div className="transport-actions">
              <button
                className="start-button"
                type="button"
                onClick={handleStartConnection}
                disabled={!canStart}
              >
                {connectionState === "connecting"
                  ? "Connecting..."
                  : "Start Live Connection"}
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

            <div className="utterance-composer">
              <label className="panel-label" htmlFor="live-utterance">
                Demo utterance
              </label>
              <textarea
                id="live-utterance"
                className="session-textarea"
                value={utteranceText}
                onChange={(event) => setUtteranceText(event.target.value)}
                placeholder="Say something natural, or ask PersonaFlow to pull out a phrase card."
                rows={4}
              />
              <div className="transport-actions">
                <button
                  className="start-button"
                  type="button"
                  onClick={handleSendUtterance}
                  disabled={connectionState !== "connected"}
                >
                  Send Utterance
                </button>
              </div>
              <p className="session-meta">
                Include "phrase card" in the utterance to trigger the live tool bridge.
              </p>
              {utteranceError ? <p className="error-note">{utteranceError}</p> : null}
            </div>

            <div className="tool-status-panel">
              <div className="transcript-header">
                <div>
                  <p className="panel-label">Tool bridge</p>
                  <p className="transcript-subtitle">
                    One app-level PersonaFlow tool is available in the live session.
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
                  Typed app-level events from the Gemini Live boundary land here.
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
                    Start the connection to verify the Gemini Live provider boundary.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="session-actions">
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
