export type PhraseCard = {
  id: string;
  source_text: string;
  english_expression: string;
  tone_tag: string;
  usage_note: string;
};

export type SessionResults = {
  sessionId: string;
  reviewedMoments: number;
  summaryPlaceholder: string;
  cards: PhraseCard[];
};

const MOCK_RESULTS: SessionResults = {
  sessionId: "demo-session",
  reviewedMoments: 3,
  summaryPlaceholder:
    "Session summary will appear here after backend wiring. For now, this space shows where PersonaFlow can briefly reflect the learner's speaking style, recurring themes, and a few reusable moments worth reviewing.",
  cards: [
    {
      id: "card-1",
      source_text: "なんか今日はちょっと落ち着いて話したい気分だった。",
      english_expression: "I was in the mood for a calmer kind of conversation today.",
      tone_tag: "calm and reflective",
      usage_note:
        "Useful when you want to set a softer tone without sounding stiff or formal.",
    },
    {
      id: "card-2",
      source_text: "それ、嫌いじゃないけど毎日はきついかも。",
      english_expression: "I don't mind that, but it might be a bit much for me every day.",
      tone_tag: "gentle boundary",
      usage_note:
        "A natural way to push back lightly while still sounding open and personable.",
    },
    {
      id: "card-3",
      source_text: "ちゃんと自分の言葉で伝えたい感じがある。",
      english_expression: "I want to put that into my own words properly.",
      tone_tag: "personal and intentional",
      usage_note:
        "Good for moments when you want to sound thoughtful and clearly personal, not generic.",
    },
  ],
};

export function getSessionResults(sessionId: string): SessionResults {
  return {
    ...MOCK_RESULTS,
    sessionId,
  };
}
