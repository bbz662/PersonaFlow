"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RealtimePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "tool_running"
  | "error";

type TranscriptEntry = {
  id: string;
  speaker: "learner" | "assistant" | "system";
  text: string;
  detail: string;
};

type ToolEvent = {
  id: string;
  name: string;
  status: "queued" | "running" | "completed";
  summary: string;
  output: string;
};

type PhaseDescriptor = {
  title: string;
  detail: string;
  connectionLabel: string;
  assistantLabel: string;
  indicatorTone: "neutral" | "active" | "warn" | "error";
};

const phaseDescriptors: Record<RealtimePhase, PhaseDescriptor> = {
  idle: {
    title: "Ready for a voice turn",
    detail: "The shell is staged for a new session. No live transport or audio capture is running.",
    connectionLabel: "Disconnected",
    assistantLabel: "Waiting",
    indicatorTone: "neutral",
  },
  connecting: {
    title: "Connecting realtime session",
    detail: "Mock connection setup is in progress so the future handoff into live audio is visible.",
    connectionLabel: "Connecting",
    assistantLabel: "Booting",
    indicatorTone: "warn",
  },
  listening: {
    title: "Listening for the learner",
    detail: "The assistant is ready for the next spoken turn and the transcript can keep streaming.",
    connectionLabel: "Connected",
    assistantLabel: "Listening",
    indicatorTone: "active",
  },
  thinking: {
    title: "Thinking through the reply",
    detail: "PersonaFlow is drafting a response based on the learner's latest turn.",
    connectionLabel: "Connected",
    assistantLabel: "Thinking",
    indicatorTone: "warn",
  },
  speaking: {
    title: "Speaking back to the learner",
    detail: "A spoken reply is being delivered while the transcript panel stays readable for demo purposes.",
    connectionLabel: "Connected",
    assistantLabel: "Speaking",
    indicatorTone: "active",
  },
  tool_running: {
    title: "Running a support tool",
    detail: "A mock helper step is active to show how structured tool work can appear mid-session.",
    connectionLabel: "Connected",
    assistantLabel: "Using tool",
    indicatorTone: "warn",
  },
  error: {
    title: "Recoverable interruption",
    detail: "The session hit a transient failure. The banner exposes the recovery path without leaving the screen.",
    connectionLabel: "Interrupted",
    assistantLabel: "Paused",
    indicatorTone: "error",
  },
};

const baseTranscript: TranscriptEntry[] = [
  {
    id: "system-ready",
    speaker: "system",
    text: "Realtime shell loaded with mocked session state.",
    detail: "Session scaffold",
  },
  {
    id: "learner-1",
    speaker: "learner",
    text: "I want to explain my weekend in a casual way, not too formal.",
    detail: "Learner turn",
  },
  {
    id: "assistant-1",
    speaker: "assistant",
    text: "Keep speaking naturally and PersonaFlow can turn the memorable parts into reusable English phrases later.",
    detail: "Assistant prompt",
  },
];

const listeningTranscript: TranscriptEntry = {
  id: "listening-prompt",
  speaker: "system",
  text: "Microphone is armed in mock mode. Waiting for the next learner turn.",
  detail: "Listening",
};

const thinkingTranscript: TranscriptEntry = {
  id: "thinking-turn",
  speaker: "learner",
  text: "I ended up staying home, cooking curry, and talking for hours with my sister.",
  detail: "Latest learner turn",
};

const speakingTranscript: TranscriptEntry = {
  id: "assistant-reply",
  speaker: "assistant",
  text: "That sounds warm and personal. A natural English version could be: I stayed in, made curry, and ended up talking with my sister for hours.",
  detail: "Mock reply",
};

const baseToolEvent: ToolEvent = {
  id: "tool-phrase-candidate",
  name: "Phrase candidate extraction",
  status: "queued",
  summary: "Watching for memorable phrasing that reflects the learner's tone.",
  output: "No active tool run yet.",
};

const completedToolEvent: ToolEvent = {
  id: "tool-phrase-candidate-complete",
  name: "Phrase candidate extraction",
  status: "completed",
  summary: "One reusable phrase candidate was identified from the current turn.",
  output:
    "Candidate: 'I stayed in, made curry, and ended up talking with my sister for hours.' Tone: warm, casual, personal.",
};

function buildTranscript(phase: RealtimePhase) {
  if (phase === "connecting" || phase === "idle" || phase === "error") {
    return baseTranscript;
  }

  if (phase === "listening") {
    return [...baseTranscript, listeningTranscript];
  }

  if (phase === "thinking" || phase === "tool_running") {
    return [...baseTranscript, thinkingTranscript];
  }

  return [...baseTranscript, thinkingTranscript, speakingTranscript];
}

function buildToolEvent(phase: RealtimePhase) {
  if (phase === "tool_running") {
    return {
      ...baseToolEvent,
      status: "running",
      output: "Evaluating the learner's latest turn for a reusable phrase card seed...",
    } satisfies ToolEvent;
  }

  if (phase === "speaking") {
    return completedToolEvent;
  }

  return baseToolEvent;
}

function phasePillLabel(phase: RealtimePhase) {
  return phase.replace("_", " ");
}

function ConnectionStatus({ phase }: { phase: RealtimePhase }) {
  const descriptor = phaseDescriptors[phase];

  return (
    <div className="voice-card voice-status-card" aria-live="polite">
      <p className="panel-label">Connection status</p>
      <div className="voice-status-row">
        <span
          className={`voice-indicator voice-indicator-${descriptor.indicatorTone}`}
          aria-hidden="true"
        />
        <div>
          <p className="voice-status-value">{descriptor.connectionLabel}</p>
          <p className="voice-status-copy">{descriptor.detail}</p>
        </div>
      </div>
    </div>
  );
}

function AssistantStateIndicator({ phase }: { phase: RealtimePhase }) {
  const descriptor = phaseDescriptors[phase];

  return (
    <div className="voice-card voice-status-card" aria-live="polite">
      <p className="panel-label">Assistant state</p>
      <p className="voice-state-title">{descriptor.assistantLabel}</p>
      <p className="voice-status-copy">{descriptor.title}</p>
      <p className="voice-phase-pill">{phasePillLabel(phase)}</p>
    </div>
  );
}

function TranscriptPanel({ phase }: { phase: RealtimePhase }) {
  const transcript = buildTranscript(phase);

  return (
    <section className="voice-card voice-panel-tall">
      <div className="voice-panel-header">
        <div>
          <p className="panel-label">Transcript panel</p>
          <p className="transcript-subtitle">
            Mock entries show where the live transcript stream will land during the session.
          </p>
        </div>
      </div>

      <div className="voice-transcript-feed" aria-live="polite">
        {transcript.map((entry) => (
          <article className={`voice-transcript-entry speaker-${entry.speaker}`} key={entry.id}>
            <p className="transcript-speaker">{entry.detail}</p>
            <p className="transcript-text">{entry.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ToolPanel({ phase }: { phase: RealtimePhase }) {
  const toolEvent = buildToolEvent(phase);

  return (
    <section className="voice-card">
      <div className="voice-panel-header">
        <div>
          <p className="panel-label">Tool activity</p>
          <p className="voice-status-copy">
            Support tools stay visible but secondary so the session still feels conversation-first.
          </p>
        </div>
        <p className={`voice-tool-badge voice-tool-${toolEvent.status}`}>{toolEvent.status}</p>
      </div>

      <div className="voice-tool-block">
        <p className="voice-tool-name">{toolEvent.name}</p>
        <p className="voice-tool-summary">{toolEvent.summary}</p>
      </div>

      <div className="voice-tool-result">
        <p className="panel-label">Result</p>
        <p className="transcript-text">{toolEvent.output}</p>
      </div>
    </section>
  );
}

function MicrophoneControl({
  phase,
  onPrimaryAction,
  onReset,
  onError,
}: {
  phase: RealtimePhase;
  onPrimaryAction: () => void;
  onReset: () => void;
  onError: () => void;
}) {
  const descriptor = phaseDescriptors[phase];
  const primaryLabel =
    phase === "idle"
      ? "Connect Session"
      : phase === "listening"
        ? "Simulate Learner Turn"
        : phase === "error"
          ? "Resume Session"
          : "Advance Mock State";

  return (
    <section className="voice-card voice-controls-card">
      <p className="panel-label">Microphone control</p>
      <div className="voice-mic-shell">
        <button className={`voice-mic-button phase-${phase}`} type="button" onClick={onPrimaryAction}>
          {phase === "listening" ? "Mic On" : "Mic"}
        </button>
        <div>
          <p className="mic-status-title">{descriptor.title}</p>
          <p className="mic-status-copy">
            Mock-only control surface. This does not access the real microphone.
          </p>
        </div>
      </div>
      <div className="voice-control-actions">
        <button className="start-button" type="button" onClick={onPrimaryAction}>
          {primaryLabel}
        </button>
        <button className="secondary-button" type="button" onClick={onReset}>
          Reset
        </button>
        <button className="secondary-button" type="button" onClick={onError}>
          Trigger Error
        </button>
      </div>
    </section>
  );
}

export default function RealtimeVoicePage() {
  const [phase, setPhase] = useState<RealtimePhase>("idle");
  const timersRef = useRef<number[]>([]);

  const descriptor = useMemo(() => phaseDescriptors[phase], [phase]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  function clearTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function queuePhase(nextPhase: RealtimePhase, delayMs: number) {
    const timer = window.setTimeout(() => {
      setPhase(nextPhase);
      timersRef.current = timersRef.current.filter((activeTimer) => activeTimer !== timer);
    }, delayMs);

    timersRef.current.push(timer);
  }

  function startCycleFromListening() {
    clearTimers();
    setPhase("thinking");
    queuePhase("tool_running", 1200);
    queuePhase("speaking", 2400);
    queuePhase("listening", 4200);
  }

  function handlePrimaryAction() {
    if (phase === "idle" || phase === "error") {
      clearTimers();
      setPhase("connecting");
      queuePhase("listening", 1400);
      return;
    }

    if (phase === "listening") {
      startCycleFromListening();
      return;
    }

    if (phase === "connecting") {
      clearTimers();
      setPhase("listening");
      return;
    }

    if (phase === "thinking") {
      clearTimers();
      setPhase("tool_running");
      queuePhase("speaking", 1200);
      queuePhase("listening", 2800);
      return;
    }

    if (phase === "tool_running") {
      clearTimers();
      setPhase("speaking");
      queuePhase("listening", 1800);
      return;
    }

    clearTimers();
    setPhase("listening");
  }

  function handleReset() {
    clearTimers();
    setPhase("idle");
  }

  function handleError() {
    clearTimers();
    setPhase("error");
  }

  return (
    <main className="session-shell">
      <section className="live-session-card realtime-demo-card">
        <header className="live-session-header">
          <div>
            <p className="eyebrow">Realtime voice demo</p>
            <h1 className="session-title">A visible shell for future live conversation.</h1>
            <p className="lede">
              This screen uses local mocked state only. It demonstrates connection, turn-taking,
              assistant activity, tool visibility, and error recovery without backend or provider
              wiring.
            </p>
          </div>
          <div className="session-status-block">
            <p className="session-status-label">Demo phase</p>
            <p className="session-status-value">{descriptor.title}</p>
            <p className="session-meta">{descriptor.detail}</p>
          </div>
        </header>

        {phase === "error" ? (
          <div className="voice-error-banner" role="alert">
            <div>
              <p className="panel-label">Recoverable error</p>
              <p className="voice-error-title">Connection dropped during a mock realtime turn.</p>
              <p className="voice-status-copy">
                Use Resume Session to return to the connecting flow. No transcript data is lost in
                this demo state.
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={handlePrimaryAction}>
              Resume Session
            </button>
          </div>
        ) : null}

        <section className="voice-grid voice-grid-top">
          <ConnectionStatus phase={phase} />
          <AssistantStateIndicator phase={phase} />
        </section>

        <section className="voice-grid voice-grid-main">
          <TranscriptPanel phase={phase} />
          <div className="voice-side-column">
            <MicrophoneControl
              phase={phase}
              onPrimaryAction={handlePrimaryAction}
              onReset={handleReset}
              onError={handleError}
            />
            <ToolPanel phase={phase} />
          </div>
        </section>
      </section>
    </main>
  );
}
