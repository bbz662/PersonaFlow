"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  fetchSessionResults,
  type SessionResults,
} from "../../../../lib/session-results";

export default function SessionResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [results, setResults] = useState<SessionResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const payload = await fetchSessionResults(sessionId);
        if (cancelled) {
          return;
        }
        setResults(payload);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setResults(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load session results right now.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [requestVersion, sessionId]);

  useEffect(() => {
    setActiveCardIndex((current) => {
      const cardCount = results?.cards.length ?? 0;
      if (cardCount === 0) {
        return 0;
      }
      return Math.min(current, cardCount - 1);
    });
  }, [results?.cards.length]);

  const cardCount = results?.cards.length ?? 0;
  const activeCard = results?.cards[activeCardIndex] ?? null;
  const isFirstCard = activeCardIndex === 0;
  const isLastCard = cardCount === 0 || activeCardIndex === cardCount - 1;
  const sessionSummary = results?.session.session_summary?.trim() || null;

  function showPreviousCard() {
    setActiveCardIndex((current) => Math.max(0, current - 1));
  }

  function showNextCard() {
    setActiveCardIndex((current) => Math.min(cardCount - 1, current + 1));
  }

  function retryResultsLoad() {
    setRequestVersion((current) => current + 1);
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
            <p className="session-status-value">{sessionId}</p>
            <p className="session-meta">
              {isLoading
                ? "Loading results..."
                : `${cardCount} phrase card${cardCount === 1 ? "" : "s"} ready`}
            </p>
            <p className="session-meta">
              {results?.session.status
                ? `Status: ${results.session.status}`
                : "Waiting for session metadata."}
            </p>
          </div>
        </header>

        <section className="results-grid" aria-label="Post-session review">
          <article className="session-panel summary-panel">
            <p className="panel-label">Session summary</p>
            <h2 className="results-section-title">Session recap</h2>
            {isLoading ? (
              <p className="summary-copy">Loading session summary and phrase cards...</p>
            ) : errorMessage ? (
              <>
                <p className="error-note">{errorMessage}</p>
                <button className="secondary-button" type="button" onClick={retryResultsLoad}>
                  Try Again
                </button>
              </>
            ) : sessionSummary ? (
              <p className="summary-copy">{sessionSummary}</p>
            ) : (
              <p className="summary-copy">
                This session finished without a saved summary, but the phrase cards below are
                still ready to review.
              </p>
            )}
          </article>

          <article className="session-panel phrase-review-panel">
            <div className="phrase-review-header">
              <div>
                <p className="panel-label">Phrase cards</p>
                <h2 className="results-section-title">Review one card at a time</h2>
              </div>
              <p className="card-position">
                {cardCount === 0 ? "0 / 0" : `${activeCardIndex + 1} / ${cardCount}`}
              </p>
            </div>

            {isLoading ? (
              <div className="phrase-card" aria-live="polite">
                <p className="summary-copy">Loading phrase cards...</p>
              </div>
            ) : errorMessage ? (
              <div className="phrase-card" aria-live="polite">
                <p className="error-note">{errorMessage}</p>
                <button className="secondary-button" type="button" onClick={retryResultsLoad}>
                  Try Again
                </button>
              </div>
            ) : activeCard ? (
              <>
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
              </>
            ) : (
              <div className="phrase-card" aria-live="polite">
                <p className="summary-copy">
                  No phrase cards were generated for this session yet. Complete another session
                  with at least one user transcript moment to populate this review area.
                </p>
              </div>
            )}
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
