"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  apiBaseUrl,
  defaultRealtimeAudioMode,
  realtimeVoiceEnabled,
} from "../../lib/runtime-config";

type StartSessionResponse = {
  session_id: string;
  status: string;
  started_at: string;
};

export default function RealtimeVoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioMode = searchParams.get("audio") === "browser" ? "browser" : defaultRealtimeAudioMode;

  async function handleStartRealtimeSession() {
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
        throw new Error("Unable to start the realtime demo session.");
      }

      const payload = (await response.json()) as StartSessionResponse;
      const sessionSearchParams = new URLSearchParams({
        startedAt: payload.started_at,
        audio: audioMode,
      });

      router.push(`/session/${payload.session_id}?${sessionSearchParams.toString()}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start the realtime demo session.",
      );
    } finally {
      setIsStarting(false);
    }
  }

  if (!realtimeVoiceEnabled) {
    return (
      <main className="session-shell">
        <section className="live-session-card realtime-demo-card">
          <header className="live-session-header">
            <div>
              <p className="eyebrow">Realtime voice demo</p>
              <h1 className="session-title">Realtime voice is disabled.</h1>
              <p className="lede">
                Set <code>NEXT_PUBLIC_REALTIME_VOICE_ENABLED=true</code> to expose this path
                locally.
              </p>
            </div>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className="session-shell">
      <section className="live-session-card realtime-demo-card">
        <header className="live-session-header">
          <div>
            <p className="eyebrow">Realtime voice demo</p>
            <h1 className="session-title">Run the end-to-end phrase-card voice slice.</h1>
            <p className="lede">
              This demo captures a spoken turn through the audio adapter, sends it into the
              Gemini Live boundary, runs the PersonaFlow phrase-card tool, and shows the reply
              back in the UI.
            </p>
          </div>
          <div className="session-status-block">
            <p className="session-status-label">Audio mode</p>
            <p className="session-status-value">{audioMode}</p>
            <p className="session-meta">
              Use <code>?audio=browser</code> for microphone input or keep the default mock mode
              for the deterministic hackathon demo.
            </p>
          </div>
        </header>

        <section className="session-panels" aria-label="Realtime demo overview">
          <div className="session-panel">
            <p className="panel-label">Primary scenario</p>
            <p className="transcript-text">
              The learner talks about staying in, making curry, and talking with their sister for
              hours. PersonaFlow turns that moment into one visible phrase-card preview and answers
              with the tool result.
            </p>
          </div>
          <div className="session-panel">
            <p className="panel-label">What you will see</p>
            <p className="transcript-text">
              Transcript updates, tool activity, assistant output, and clear retry or teardown
              controls on one live session screen.
            </p>
          </div>
        </section>

        <div className="session-actions">
          {errorMessage ? <p className="error-note">{errorMessage}</p> : null}
          <button
            className="start-button"
            type="button"
            onClick={handleStartRealtimeSession}
            disabled={isStarting}
          >
            {isStarting ? "Starting..." : "Start Realtime Demo"}
          </button>
        </div>
      </section>
    </main>
  );
}
