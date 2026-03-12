export default function HomePage() {
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
          <button className="start-button" type="button">
            Start Session
          </button>
          <p className="button-note">Session flow placeholder for the next issue.</p>
        </div>
      </section>
    </main>
  );
}
