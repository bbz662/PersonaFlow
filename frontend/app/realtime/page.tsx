"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { createAudioIO, createSineWaveChunk, type AudioIO, type AudioIOMode } from "../../lib/audio-io";
import {
  defaultRealtimeAudioMode,
  realtimeVoiceEnabled,
} from "../../lib/runtime-config";
import {
  initialVoiceSessionState,
  voiceSessionReducer,
  type VoiceSessionEvent,
  type VoiceSessionState,
  type VoiceSessionStatus,
} from "../../lib/voice-session-state";

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

const phaseDescriptors: Record<VoiceSessionStatus, PhaseDescriptor> = {
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
  connected: {
    title: "Connected and standing by",
    detail: "The session is connected and ready to arm the microphone for the next learner turn.",
    connectionLabel: "Connected",
    assistantLabel: "Ready",
    indicatorTone: "active",
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
  interrupted: {
    title: "Session interrupted",
    detail: "An interruption paused the active turn and left the session ready to reconnect cleanly.",
    connectionLabel: "Interrupted",
    assistantLabel: "Paused",
    indicatorTone: "error",
  },
  disconnected: {
    title: "Session disconnected",
    detail: "The realtime session has ended locally. Reconnect to start a new mock turn cycle.",
    connectionLabel: "Disconnected",
    assistantLabel: "Offline",
    indicatorTone: "neutral",
  },
  error: {
    title: "Error needs attention",
    detail: "The session hit an error state. Recoverable and fatal failures are surfaced explicitly.",
    connectionLabel: "Error",
    assistantLabel: "Blocked",
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
  text: "Microphone is armed through the audio adapter. Waiting for the next learner turn.",
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

function buildTranscript(state: VoiceSessionState) {
  switch (state.status) {
    case "listening":
      return [...baseTranscript, listeningTranscript];
    case "thinking":
    case "tool_running":
      return [...baseTranscript, thinkingTranscript];
    case "speaking":
      return [...baseTranscript, thinkingTranscript, speakingTranscript];
    case "interrupted":
      return [
        ...baseTranscript,
        {
          id: "interrupted-turn",
          speaker: "system",
          text: `Current turn paused from ${state.interruptedFrom.replace("_", " ")}.`,
          detail: "Interrupted",
        },
      ];
    case "error":
      return [
        ...baseTranscript,
        {
          id: "error-turn",
          speaker: "system",
          text: state.message,
          detail: state.recoverable ? "Recoverable error" : "Fatal error",
        },
      ];
    default:
      return baseTranscript;
  }
}

function buildToolEvent(status: VoiceSessionStatus) {
  if (status === "tool_running") {
    return {
      ...baseToolEvent,
      status: "running",
      output: "Evaluating the learner's latest turn for a reusable phrase card seed...",
    } satisfies ToolEvent;
  }

  if (status === "speaking") {
    return completedToolEvent;
  }

  return baseToolEvent;
}

function phasePillLabel(status: VoiceSessionStatus) {
  return status.replace("_", " ");
}

function ConnectionStatus({ status }: { status: VoiceSessionStatus }) {
  const descriptor = phaseDescriptors[status];

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

function AssistantStateIndicator({ status }: { status: VoiceSessionStatus }) {
  const descriptor = phaseDescriptors[status];

  return (
    <div className="voice-card voice-status-card" aria-live="polite">
      <p className="panel-label">Assistant state</p>
      <p className="voice-state-title">{descriptor.assistantLabel}</p>
      <p className="voice-status-copy">{descriptor.title}</p>
      <p className="voice-phase-pill">{phasePillLabel(status)}</p>
    </div>
  );
}

function TranscriptPanel({ state }: { state: VoiceSessionState }) {
  const transcript = buildTranscript(state);

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

function ToolPanel({ status }: { status: VoiceSessionStatus }) {
  const toolEvent = buildToolEvent(status);

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

function resolveAudioMode(): AudioIOMode {
  if (typeof window === "undefined") {
    return defaultRealtimeAudioMode;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("audio") === "browser") {
    return "browser";
  }

  return defaultRealtimeAudioMode;
}

function primaryActionLabel(status: VoiceSessionStatus) {
  switch (status) {
    case "idle":
      return "Connect Session";
    case "connecting":
      return "Finish Connecting";
    case "connected":
      return "Start Listening";
    case "listening":
      return "Simulate Learner Turn";
    case "thinking":
      return "Start Response";
    case "speaking":
      return "Finish Response";
    case "tool_running":
      return "Finish Tool Step";
    case "interrupted":
      return "Reconnect Session";
    case "disconnected":
      return "Reconnect Session";
    case "error":
      return "Resume Session";
  }
}

function MicrophoneControl({
  state,
  onPrimaryAction,
  onDisconnect,
  onInterrupt,
  onRecoverableError,
}: {
  state: VoiceSessionState;
  onPrimaryAction: () => void;
  onDisconnect: () => void;
  onInterrupt: () => void;
  onRecoverableError: () => void;
}) {
  const descriptor = phaseDescriptors[state.status];

  return (
    <section className="voice-card voice-controls-card">
      <p className="panel-label">Microphone control</p>
      <div className="voice-mic-shell">
        <button className={`voice-mic-button phase-${state.status}`} type="button" onClick={onPrimaryAction}>
          {state.status === "listening" ? "Mic On" : "Mic"}
        </button>
        <div>
          <p className="mic-status-title">{descriptor.title}</p>
          <p className="mic-status-copy">
            Input and playback now route through the audio adapter layer for browser and mock modes.
          </p>
        </div>
      </div>
      <div className="voice-control-actions">
        <button className="start-button" type="button" onClick={onPrimaryAction}>
          {primaryActionLabel(state.status)}
        </button>
        <button className="secondary-button" type="button" onClick={onDisconnect}>
          Disconnect
        </button>
        <button className="secondary-button" type="button" onClick={onInterrupt}>
          Interrupt
        </button>
        <button className="secondary-button" type="button" onClick={onRecoverableError}>
          Trigger Error
        </button>
      </div>
    </section>
  );
}

export default function RealtimeVoicePage() {
  const [state, dispatch] = useReducer(voiceSessionReducer, initialVoiceSessionState);
  const [audioMode, setAudioMode] = useState<AudioIOMode>("mock");
  const timersRef = useRef<number[]>([]);
  const audioRef = useRef<AudioIO | null>(null);
  const stateRef = useRef(state);
  const learnerTurnQueuedRef = useRef(false);
  const playbackActiveRef = useRef(false);

  const descriptor = phaseDescriptors[state.status];

  function dispatchEvent(event: VoiceSessionEvent) {
    dispatch(event);
  }

  function clearTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function queueEvent(event: VoiceSessionEvent, delayMs: number) {
    const timer = window.setTimeout(() => {
      dispatchEvent(event);
      timersRef.current = timersRef.current.filter((activeTimer) => activeTimer !== timer);
    }, delayMs);

    timersRef.current.push(timer);
  }

  function interruptAudio() {
    clearTimers();
    learnerTurnQueuedRef.current = false;
    playbackActiveRef.current = false;
    void audioRef.current?.stopInput();
    audioRef.current?.flushPlayback();
  }

  function startConnectionFlow() {
    interruptAudio();
    dispatchEvent({ type: "connect.request" });
    queueEvent({ type: "connected" }, 800);
    queueEvent({ type: "mic.start" }, 1400);
  }

  function startLearnerTurnFlow() {
    clearTimers();
    learnerTurnQueuedRef.current = true;
    void audioRef.current?.stopInput();
    dispatchEvent({ type: "speech.detected" });
    queueEvent({ type: "tool.call.started" }, 1200);
    queueEvent({ type: "tool.call.finished" }, 2400);
    queueEvent({ type: "response.started" }, 2600);
    queueEvent({ type: "response.ended" }, 4200);
    queueEvent({ type: "mic.start" }, 5000);
  }

  function streamPlaybackChunks() {
    const audio = audioRef.current;

    if (!audio || playbackActiveRef.current) {
      return;
    }

    const playbackPlan = [
      createSineWaveChunk({ frequencyHz: 220, durationMs: 220, phaseOffset: 0 }),
      createSineWaveChunk({ frequencyHz: 246, durationMs: 220, phaseOffset: 4_000 }),
      createSineWaveChunk({ frequencyHz: 261, durationMs: 220, phaseOffset: 8_000 }),
    ];

    playbackPlan.forEach((chunk, index) => {
      const timer = window.setTimeout(() => {
        void audio.pushPlaybackChunk(chunk);
        timersRef.current = timersRef.current.filter((activeTimer) => activeTimer !== timer);
      }, index * 150);

      timersRef.current.push(timer);
    });
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const mode = resolveAudioMode();
    setAudioMode(mode);
    audioRef.current = createAudioIO({
      mode,
      callbacks: {
        onInputChunk: () => {
          if (stateRef.current.status !== "listening" || learnerTurnQueuedRef.current) {
            return;
          }

          learnerTurnQueuedRef.current = true;
          startLearnerTurnFlow();
        },
        onPlaybackStateChange: (playing) => {
          playbackActiveRef.current = playing;
        },
      },
    });

    return () => {
      clearTimers();
      learnerTurnQueuedRef.current = false;
      playbackActiveRef.current = false;
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (state.status === "listening") {
      learnerTurnQueuedRef.current = false;
      void audio.startInput().catch(() => {
        dispatch({
          type: "recoverable.error",
          message: "Unable to start audio input for the realtime demo.",
        });
      });
      return;
    }

    void audio.stopInput().catch(() => {
      dispatch({
        type: "recoverable.error",
        message: "Unable to stop audio input cleanly for the realtime demo.",
      });
    });

    if (
      state.status === "interrupted" ||
      state.status === "disconnected" ||
      state.status === "error" ||
      state.status === "connected"
    ) {
      audio.flushPlayback();
      playbackActiveRef.current = false;
    }

    if (state.status === "speaking") {
      streamPlaybackChunks();
    }
  }, [state.status]);

  function handlePrimaryAction() {
    switch (state.status) {
      case "idle":
      case "interrupted":
      case "disconnected":
      case "error":
        startConnectionFlow();
        return;
      case "connecting":
        clearTimers();
        dispatchEvent({ type: "connected" });
        queueEvent({ type: "mic.start" }, 250);
        return;
      case "connected":
        clearTimers();
        dispatchEvent({ type: "mic.start" });
        return;
      case "listening":
        startLearnerTurnFlow();
        return;
      case "thinking":
        clearTimers();
        dispatchEvent({ type: "response.started" });
        queueEvent({ type: "response.ended" }, 1600);
        queueEvent({ type: "mic.start" }, 2400);
        return;
      case "tool_running":
        clearTimers();
        dispatchEvent({ type: "tool.call.finished" });
        queueEvent({ type: "response.started" }, 250);
        queueEvent({ type: "response.ended" }, 1800);
        queueEvent({ type: "mic.start" }, 2600);
        return;
      case "speaking":
        clearTimers();
        audioRef.current?.flushPlayback();
        playbackActiveRef.current = false;
        dispatchEvent({ type: "response.ended" });
        queueEvent({ type: "mic.start" }, 500);
        return;
    }
  }

  function handleDisconnect() {
    interruptAudio();
    dispatchEvent({ type: "disconnect" });
  }

  function handleInterrupt() {
    interruptAudio();
    if (
      state.status === "connecting" ||
      state.status === "connected" ||
      state.status === "listening" ||
      state.status === "thinking" ||
      state.status === "speaking" ||
      state.status === "tool_running"
    ) {
      dispatchEvent({ type: "interruption" });
    }
  }

  function handleRecoverableError() {
    interruptAudio();
    dispatchEvent({
      type: "recoverable.error",
      message: "Connection dropped during a mock realtime turn.",
    });
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
                Set <code>NEXT_PUBLIC_REALTIME_VOICE_ENABLED=true</code> to expose this
                path locally. Keep the backend flag aligned with <code>REALTIME_VOICE_ENABLED=true</code> when you wire a live transport.
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
            <h1 className="session-title">A visible shell for future live conversation.</h1>
            <p className="lede">
              This screen uses local mocked state only. It demonstrates connection, turn-taking,
              assistant activity, interruption handling, tool visibility, and error recovery
              without backend or provider wiring.
            </p>
          </div>
          <div className="session-status-block">
            <p className="session-status-label">Demo phase</p>
            <p className="session-status-value">{descriptor.title}</p>
            <p className="session-meta">
              {descriptor.detail} Audio adapter: {audioMode}.
            </p>
          </div>
        </header>

        {state.status === "error" ? (
          <div className="voice-error-banner" role="alert">
            <div>
              <p className="panel-label">{state.recoverable ? "Recoverable error" : "Fatal error"}</p>
              <p className="voice-error-title">{state.message}</p>
              <p className="voice-status-copy">
                {state.recoverable
                  ? "Use Resume Session to return to the connecting flow. No transcript data is lost in this demo state."
                  : "Reconnect to start a fresh mock session after a fatal failure."}
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={handlePrimaryAction}>
              {state.recoverable ? "Resume Session" : "Reconnect Session"}
            </button>
          </div>
        ) : null}

        {state.status === "interrupted" ? (
          <div className="voice-error-banner" role="status">
            <div>
              <p className="panel-label">Interrupted</p>
              <p className="voice-error-title">
                Mock interruption paused the session during {state.interruptedFrom.replace("_", " ")}.
              </p>
              <p className="voice-status-copy">
                Reconnect to return to the deterministic connect and listen flow.
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={handlePrimaryAction}>
              Reconnect Session
            </button>
          </div>
        ) : null}

        <section className="voice-grid voice-grid-top">
          <ConnectionStatus status={state.status} />
          <AssistantStateIndicator status={state.status} />
        </section>

        <section className="voice-grid voice-grid-main">
          <TranscriptPanel state={state} />
          <div className="voice-side-column">
            <MicrophoneControl
              state={state}
              onPrimaryAction={handlePrimaryAction}
              onDisconnect={handleDisconnect}
              onInterrupt={handleInterrupt}
              onRecoverableError={handleRecoverableError}
            />
            <ToolPanel status={state.status} />
          </div>
        </section>
      </section>
    </main>
  );
}

