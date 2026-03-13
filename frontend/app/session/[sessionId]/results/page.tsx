"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { getSessionResults } from "../../../../lib/session-results";

export default function SessionResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const results = useMemo(() => getSessionResults(sessionId), [sessionId]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const activeCard = results.cards[activeCardIndex];
  const isFirstCard = activeCardIndex === 0;
  const isLastCard = activeCardIndex === results.cards.length - 1;

  function showPreviousCard() {
    setActiveCardIndex((current) => Math.max(0, current - 1));
  }

  function showNextCard() {
    setActiveCardIndex((current) => Math.min(results.cards.length - 1, current + 1));
  }

  return (
    <main className="session-shell">
      <section className="results-card">
        <header className="results-header">
          <div>
            <p className="eyebrow">Session review</p>
            <h1 className="session-title">Review what still sounds like you.</h1>
            <p className="lede results-lede">
              A lightweight post-session screen for scanning your recap and browsing
              reusable English phrasing from the conversation.
            </p>
          </div>
          <div className="session-status-block">
            <p className="session-status-label">Session</p>
            <p className="session-status-value">{results.sessionId}</p>
            <p className="session-meta">{results.cards.length} phrase cards ready</p>
            <p className="session-meta">
              {results.reviewedMoments} moments marked for later review
            </p>
          </div>
        </header>

        <section className="results-grid" aria-label="Post-session review">
          <article className="session-panel summary-panel">
            <p className="panel-label">Session summary</p>
            <h2 className="results-section-title">Placeholder recap area</h2>
            <p className="summary-copy">{results.summaryPlaceholder}</p>
          </article>

          <article className="session-panel phrase-review-panel">
            <div className="phrase-review-header">
              <div>
                <p className="panel-label">Phrase cards</p>
                <h2 className="results-section-title">Review one card at a time</h2>
              </div>
              <p className="card-position">
                {activeCardIndex + 1} / {results.cards.length}
              </p>
            </div>

            <div className="phrase-card" aria-live="polite">
              <div className="phrase-card-section">
                <p className="phrase-card-label">Original moment</p>
                <p className="phrase-card-text">{activeCard.source_text}</p>
              </div>

              <div className="phrase-card-section">
                <p className="phrase-card-label">English phrasing</p>
                <p className="phrase-card-expression">{activeCard.english_expression}</p>
              </div>

              <div className="phrase-card-meta">
                <div>
                  <p className="phrase-card-label">Tone</p>
                  <p className="phrase-card-meta-value">{activeCard.tone_tag}</p>
                </div>
                <div>
                  <p className="phrase-card-label">Usage note</p>
                  <p className="phrase-card-meta-value">{activeCard.usage_note}</p>
                </div>
              </div>
            </div>

            <div className="card-browser" aria-label="Phrase card navigation">
              <button
                className="secondary-button"
                type="button"
                onClick={showPreviousCard}
                disabled={isFirstCard}
              >
                Previous
              </button>
              <div className="card-pager">
                {results.cards.map((card, index) => (
                  <button
                    key={card.id}
                    className={`pager-dot${index === activeCardIndex ? " pager-dot-active" : ""}`}
                    type="button"
                    onClick={() => setActiveCardIndex(index)}
                    aria-label={`Go to card ${index + 1}`}
                    aria-pressed={index === activeCardIndex}
                  />
                ))}
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={showNextCard}
                disabled={isLastCard}
              >
                Next
              </button>
            </div>
          </article>
        </section>

        <div className="session-actions results-actions">
          <Link className="start-button processing-link" href="/">
            Start Another Session
          </Link>
        </div>
      </section>
    </main>
  );
}
