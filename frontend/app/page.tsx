"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiBaseUrl, realtimeVoiceEnabled } from "../lib/runtime-config";

type StartSessionResponse = {
  session_id: string;
  status: string;
  started_at: string;
};

export default function HomePage() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStartSession() {
    setIsStarting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/sessions/start`, {
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
      const searchParams = new URLSearchParams({
        status: payload.status,
        startedAt: payload.started_at,
      });

      router.push(`/session/${payload.session_id}?${searchParams.toString()}`);
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
          <ul className="feature-list">
            <li>Speak naturally first</li>
            <li>Review personal phrases after the session</li>
            <li>No translation-oriented workflow</li>
          </ul>
          <div className="hero-actions">
            <button
              className="start-button"
              type="button"
              onClick={handleStartSession}
              disabled={isStarting}
            >
              {isStarting ? "Starting..." : "Start Session"}
            </button>
            {realtimeVoiceEnabled ? (
              <Link className="secondary-button hero-link-button" href="/realtime">
                Open Realtime Demo
              </Link>
            ) : (
              <span
                className="secondary-button hero-link-button"
                aria-disabled="true"
              >
                Realtime Demo Disabled
              </span>
            )}
          </div>
          <p className="button-note">
            Starts an anonymous Japanese-to-English practice session.
          </p>
          {!realtimeVoiceEnabled ? (
            <p className="button-note">
              Set <code>NEXT_PUBLIC_REALTIME_VOICE_ENABLED=true</code> to expose the
              realtime voice path locally.
            </p>
          ) : null}
          {errorMessage ? <p className="error-note">{errorMessage}</p> : null}
        </div>
      </section>
    </main>
  );
}
