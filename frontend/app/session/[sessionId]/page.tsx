"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import {
  LiveSessionTransport,
  type ConnectionState,
  type SessionTransportEvent,
} from "../../../lib/live-session-transport";

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

type SessionViewState = "live" | "processing" | "completed";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const statusCopy: Record<ConnectionState, string> = {
  connecting: "Opening the live conversation transport.",
  connected: "Live transport is active and ready for minimal session events.",
  failed: "The live transport could not connect. Try starting the session again.",
  ended: "The live transport is not active.",
};

function formatStatusLabel(status: ConnectionState) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildFeedEntry(event: SessionTransportEvent, index: number): EventFeedEntry {
  return {
    id: `${event.kind}-${index}`,
    speaker: event.speaker === "agent" ? "PersonaFlow" : "Session event",
    text: event.text,
  };
}

export default function LiveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const transportRef = useRef<LiveSessionTransport | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("ended");
  const [eventFeed, setEventFeed] = useState<EventFeedEntry[]>([]);
  const [viewState, setViewState] = useState<SessionViewState>("live");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionPayload, setCompletionPayload] =
    useState<SessionCompletionResponse | null>(null);

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
      transportRef.current?.disconnect();
      transportRef.current = null;
    };
  }, []);

  function appendEvent(event: SessionTransportEvent) {
    setEventFeed((current) => [...current, buildFeedEntry(event, current.length)]);
  }

  function handleStartConnection() {
    if (!canStart) {
      return;
    }

    setEventFeed([]);

    const transport = new LiveSessionTransport({
      sessionId,
      apiBaseUrl: API_BASE_URL,
      onConnectionStateChange: (state) => {
        setConnectionState(state);

        if (state === "connected") {
          transport.sendEvent({
            kind: "client_ready",
            text: "Live session screen connected and ready for transcript events.",
          });
        }
      },
      onEvent: appendEvent,
    });

    transportRef.current = transport;
    transport.connect();
  }

  function handleStopConnection() {
    transportRef.current?.disconnect();
  }

  async function handleEndSession() {
    if (isEnding || viewState === "completed") {
      return;
    }

    setCompletionError(null);
    setViewState("processing");
    transportRef.current?.disconnect();
    transportRef.current = null;

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to end the session right now.");
      }

      const payload = (await response.json()) as SessionCompletionResponse;
      setCompletionPayload(payload);
      setViewState("completed");
    } catch (error) {
      setViewState("live");
      setCompletionError(
        error instanceof Error
          ? error.message
          : "Unable to end the session right now.",
      );
    }
  }

  if (viewState !== "live") {
    return (
      <main className="session-shell">
        <section className="live-session-card processing-card">
          <p className="eyebrow">Post-session</p>
          <h1 className="session-title">
            {viewState === "processing"
              ? "Wrapping up your session."
              : "Session processing finished."}
          </h1>
          <p className="lede processing-copy">
            {viewState === "processing"
              ? "Ending the live session and triggering minimal post-session processing."
              : "The live session has ended and the backend marked this session as completed."}
          </p>
          {completionPayload ? (
            <div className="processing-details" aria-live="polite">
              <p className="session-status-label">Session status</p>
              <p className="session-status-value">Completed</p>
              <p className="session-meta">
                Ended {new Date(completionPayload.ended_at).toLocaleString()}
              </p>
              <p className="session-meta">
                Completed {new Date(completionPayload.completed_at).toLocaleString()}
              </p>
            </div>
          ) : null}
          <div className="session-actions session-actions-start">
            {viewState === "processing" ? (
              <button className="start-button" type="button" disabled>
                Processing...
              </button>
            ) : (
              <Link className="start-button processing-link" href="/">
                Back to home
              </Link>
            )}
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
            <p className="panel-label">Live transport</p>
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
                  Minimal live transport events land here now. Transcript capture
                  and agent response rendering can build on this feed next.
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
                    Start the connection to verify the live session transport.
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
