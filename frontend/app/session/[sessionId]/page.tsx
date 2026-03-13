"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { createGeminiLiveClient } from "../../../lib/gemini-live-client";
import type {
  RealtimeConnectionState,
  RealtimeSessionClient,
  RealtimeSessionEvent,
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const statusCopy: Record<RealtimeConnectionState, string> = {
  connecting: "Opening the Gemini Live session.",
  connected: "Gemini Live is active and ready for session events.",
  failed: "The Gemini Live session could not connect. Try starting again.",
  ended: "The Gemini Live session is not active.",
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
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("ended");
  const [eventFeed, setEventFeed] = useState<EventFeedEntry[]>([]);
  const [viewState, setViewState] = useState<SessionViewState>("live");
  const [completionError, setCompletionError] = useState<string | null>(null);

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

  function handleStartConnection() {
    if (!canStart) {
      return;
    }

    unsubscribeRef.current?.();
    clientRef.current?.disconnect();
    setEventFeed([]);

    const client = createGeminiLiveClient({
      sessionId,
      apiBaseUrl: API_BASE_URL,
      onConnectionStateChange: setConnectionState,
    });

    unsubscribeRef.current = client.subscribe(appendEvent);
    clientRef.current = client;
    client.connect();
  }

  function handleStopConnection() {
    clientRef.current?.disconnect();
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
