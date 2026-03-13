const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type SessionMetadata = {
  session_id: string;
  status: string;
  source_language: string | null;
  target_language: string | null;
  started_at: string | null;
  ended_at: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  card_count: number;
  session_summary: string | null;
};

export type PhraseCard = {
  id: string;
  source_text: string;
  english_expression: string;
  tone_tag: string;
  usage_note: string;
  created_at: string;
};

type PhraseCardResponse = {
  card_id: string;
  source_text: string;
  english_expression: string;
  tone_tag: string;
  usage_note: string;
  created_at: string;
};

type PhraseCardsResponse = {
  session_id: string;
  card_count: number;
  cards: PhraseCardResponse[];
};

export type SessionResults = {
  session: SessionMetadata;
  cards: PhraseCard[];
};

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let detail = "Unable to load session results right now.";

  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      detail = payload.detail;
    }
  } catch {
    // Keep the fallback message when the response body is empty or invalid.
  }

  throw new Error(detail);
}

export async function fetchSessionResults(sessionId: string): Promise<SessionResults> {
  const [session, cardsPayload] = await Promise.all([
    fetch(`${API_BASE_URL}/sessions/${sessionId}`, { cache: "no-store" }).then((response) =>
      readJson<SessionMetadata>(response),
    ),
    fetch(`${API_BASE_URL}/sessions/${sessionId}/cards`, { cache: "no-store" }).then(
      (response) => readJson<PhraseCardsResponse>(response),
    ),
  ]);

  return {
    session: {
      ...session,
      card_count: session.card_count || cardsPayload.card_count,
      session_summary: session.session_summary?.trim() || null,
    },
    cards: cardsPayload.cards.map((card) => ({
      id: card.card_id,
      source_text: card.source_text,
      english_expression: card.english_expression,
      tone_tag: card.tone_tag,
      usage_note: card.usage_note,
      created_at: card.created_at,
    })),
  };
}
