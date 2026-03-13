import Link from "next/link";

type LiveSessionPageProps = {
  params: {
    sessionId: string;
  };
  searchParams: {
    startedAt?: string;
    status?: string;
  };
};

const transcriptPreview = [
  {
    speaker: "You",
    text: "Transcript will appear here once live speech handling is connected.",
  },
  {
    speaker: "PersonaFlow",
    text: "This screen is ready for the in-session conversation flow.",
  },
];

function formatStatus(status?: string) {
  if (!status) {
    return "Live";
  }

  return status.replace(/_/g, " ");
}

export default function LiveSessionPage({
  params,
  searchParams,
}: LiveSessionPageProps) {
  const startedAtLabel = searchParams.startedAt
    ? new Date(searchParams.startedAt).toLocaleString()
    : "Just now";

  return (
    <main className="session-shell">
      <section className="live-session-card">
        <header className="live-session-header">
          <div>
            <p className="eyebrow">Live session</p>
            <h1 className="session-title">Stay in the conversation.</h1>
          </div>
          <div className="session-status-block" aria-live="polite">
            <p className="session-status-label">Session status</p>
            <p className="session-status-value">{formatStatus(searchParams.status)}</p>
            <p className="session-meta">Started {startedAtLabel}</p>
          </div>
        </header>

        <section className="session-panels" aria-label="Live session details">
          <div className="session-panel">
            <p className="panel-label">Microphone</p>
            <div className="mic-status">
              <span className="mic-indicator" aria-hidden="true" />
              <div>
                <p className="mic-status-title">Mic placeholder</p>
                <p className="mic-status-copy">
                  Live capture is not connected yet. This area is reserved for
                  listening state and audio controls.
                </p>
              </div>
            </div>
          </div>

          <div className="session-panel transcript-panel">
            <div className="transcript-header">
              <div>
                <p className="panel-label">Transcript</p>
                <p className="transcript-subtitle">
                  A minimal running transcript will land here during the
                  session.
                </p>
              </div>
              <p className="transcript-session-id">Session {params.sessionId}</p>
            </div>

            <div className="transcript-feed" aria-live="polite">
              {transcriptPreview.map((entry) => (
                <article
                  className="transcript-entry"
                  key={`${entry.speaker}-${entry.text}`}
                >
                  <p className="transcript-speaker">{entry.speaker}</p>
                  <p className="transcript-text">{entry.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <div className="session-actions">
          <Link className="end-session-button" href="/">
            End Session
          </Link>
        </div>
      </section>
    </main>
  );
}