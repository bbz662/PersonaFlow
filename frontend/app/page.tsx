"use client";

import { useState } from "react";

type StartSessionResponse = {
  session_id: string;
  status: string;
  started_at: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function HomePage() {
  const [session, setSession] = useState<StartSessionResponse | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStartSession() {
    setIsStarting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_language: "ja",
          target_language: "en",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to start a session right now.");
      }

      const payload = (await response.json()) as StartSessionResponse;
      setSession(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start a session right now.",
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Voice-first English practice</p>
          <h1>PersonaFlow</h1>
          <p className="lede">
            Build an English voice that still feels like you. PersonaFlow turns
            natural conversation into reusable phrase cards that reflect your
            tone, not generic textbook lines.
          </p>
        </div>

        <div className="hero-panel" aria-label="Product summary">
          <div className="panel-chip">MVP</div>
          {session ? (
            <div className="session-state" aria-live="polite">
              <p className="session-label">Session started</p>
              <dl className="session-details">
                <div>
                  <dt>Session ID</dt>
                  <dd>{session.session_id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{session.status}</dd>
                </div>
                <div>
                  <dt>Started At</dt>
                  <dd>{new Date(session.started_at).toLocaleString()}</dd>
                </div>
              </dl>
              <p className="button-note">
                The session is ready for the next voice flow step.
              </p>
            </div>
          ) : (
            <>
              <ul className="feature-list">
                <li>Speak naturally first</li>
                <li>Review personal phrases after the session</li>
                <li>No translation-oriented workflow</li>
              </ul>
              <button
                className="start-button"
                type="button"
                onClick={handleStartSession}
                disabled={isStarting}
              >
                {isStarting ? "Starting..." : "Start Session"}
              </button>
              <p className="button-note">
                Starts an anonymous Japanese-to-English practice session.
              </p>
              {errorMessage ? <p className="error-note">{errorMessage}</p> : null}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
