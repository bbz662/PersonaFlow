from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
from typing import Any
from urllib import error, parse, request
from uuid import uuid4

from app.core.config import Settings, get_settings
from app.repositories.sessions import SessionRepository

MIN_PHRASE_CARDS = 3
MAX_PHRASE_CARDS = 5
_WHITESPACE_RE = re.compile(r"\s+")
_CLAUSE_SPLIT_RE = re.compile(r"[.!?\n]+")
_NON_WORD_RE = re.compile(r"[^a-z0-9]+")
_FIRST_PERSON_RE = re.compile(
    r"\b(i|i'm|i've|i'd|me|my|mine|we|we're|we've|our|ours)\b", re.IGNORECASE
)
_PERSONALITY_RE = re.compile(
    r"\b(like|love|hate|prefer|wish|hope|feel|think|guess|usually|always|never|really|kind of)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PhraseCardDraft:
    source_text: str
    english_expression: str
    tone_tag: str
    usage_note: str


class PhraseCardService:
    def __init__(
        self,
        repository: SessionRepository,
        settings: Settings | None = None,
    ) -> None:
        self._repository = repository
        self._settings = settings or get_settings()

    def generate_for_session(self, session_id: str) -> list[dict[str, str]]:
        existing_cards = self._repository.list_phrase_cards(session_id)
        if existing_cards:
            return existing_cards

        transcript_entries = self._repository.list_transcript_entries(session_id)
        drafts = self._build_phrase_card_drafts(transcript_entries)

        created_at = datetime.now(timezone.utc).isoformat()
        stored_cards: list[dict[str, str]] = []

        for draft in drafts:
            card_id = str(uuid4())
            payload = {
                "card_id": card_id,
                "source_text": draft.source_text,
                "english_expression": draft.english_expression,
                "tone_tag": draft.tone_tag,
                "usage_note": draft.usage_note,
                "created_at": created_at,
            }
            self._repository.add_phrase_card(session_id, card_id, payload)
            stored_cards.append(payload)

        return stored_cards

    def list_for_session(self, session_id: str) -> list[dict[str, str]]:
        return self._repository.list_phrase_cards(session_id)

    def _build_phrase_card_drafts(
        self, transcript_entries: list[dict[str, Any]]
    ) -> list[PhraseCardDraft]:
        candidates = self._select_candidates(transcript_entries)
        if not candidates:
            raise ValueError("At least one user transcript entry is required to generate cards.")

        gemini_cards = self._generate_with_gemini(candidates)
        if gemini_cards:
            return gemini_cards

        return [self._build_fallback_card(candidate) for candidate in candidates]

    def _select_candidates(
        self, transcript_entries: list[dict[str, Any]]
    ) -> list[dict[str, str]]:
        scored_candidates: list[tuple[int, dict[str, str]]] = []
        seen: set[str] = set()

        sorted_entries = sorted(
            transcript_entries,
            key=lambda entry: (
                int(entry.get("turn_index", 0)),
                str(entry.get("timestamp", "")),
                str(entry.get("entry_id", "")),
            ),
        )

        for entry in sorted_entries:
            if entry.get("speaker") != "user":
                continue

            language = str(entry.get("language", "") or "")
            for candidate_text in self._extract_candidate_texts(str(entry.get("text", ""))):
                normalized = self._normalize_for_dedupe(candidate_text)
                if not normalized or normalized in seen:
                    continue

                seen.add(normalized)
                scored_candidates.append(
                    (
                        self._score_candidate(candidate_text),
                        {"text": candidate_text, "language": language},
                    )
                )

        scored_candidates.sort(
            key=lambda item: (
                -item[0],
                -len(item[1]["text"]),
                item[1]["text"].lower(),
            )
        )

        return [item[1] for item in scored_candidates[:MAX_PHRASE_CARDS]]

    def _extract_candidate_texts(self, raw_text: str) -> list[str]:
        cleaned_text = self._cleanup_text(raw_text)
        if not cleaned_text:
            return []

        candidates = [cleaned_text]
        if len(cleaned_text) > 72:
            for clause in _CLAUSE_SPLIT_RE.split(cleaned_text):
                cleaned_clause = self._cleanup_text(clause)
                if cleaned_clause and len(cleaned_clause.split()) >= 3:
                    candidates.append(cleaned_clause)

        return candidates

    def _cleanup_text(self, text: str) -> str:
        collapsed = _WHITESPACE_RE.sub(" ", text).strip()
        return collapsed.strip("\"' ")

    def _normalize_for_dedupe(self, text: str) -> str:
        return _NON_WORD_RE.sub(" ", text.lower()).strip()

    def _score_candidate(self, text: str) -> int:
        word_count = len(text.split())
        score = min(word_count, 18)

        if 4 <= word_count <= 14:
            score += 5
        if _FIRST_PERSON_RE.search(text):
            score += 4
        if _PERSONALITY_RE.search(text):
            score += 4
        if "?" in text or "!" in text:
            score += 1

        return score

    def _generate_with_gemini(
        self, candidates: list[dict[str, str]]
    ) -> list[PhraseCardDraft]:
        if not self._settings.gemini_api_key:
            return []

        prompt_payload = {
            "task": (
                "Turn the user's transcript excerpts into 3 to 5 English phrase cards "
                "that preserve tone and intent. Prefer reusable, personality-revealing "
                "phrases. Avoid literal translation."
            ),
            "required_fields": [
                "source_text",
                "english_expression",
                "tone_tag",
                "usage_note",
            ],
            "rules": [
                "Return only valid JSON.",
                "Return an array with 3 to 5 objects.",
                "Keep each english_expression to one short, natural sentence or phrase.",
                "Keep tone_tag short and explicit.",
                "Keep usage_note to one sentence.",
            ],
            "candidates": candidates[:MAX_PHRASE_CARDS],
        }
        body = json.dumps(
            {
                "contents": [{"parts": [{"text": json.dumps(prompt_payload)}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            }
        ).encode("utf-8")
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{parse.quote(self._settings.gemini_model, safe='')}:generateContent"
            f"?key={parse.quote(self._settings.gemini_api_key, safe='')}"
        )
        http_request = request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (error.URLError, TimeoutError, json.JSONDecodeError):
            return []

        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            raw_cards = json.loads(text)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
            return []

        return self._validate_generated_cards(raw_cards)

    def _validate_generated_cards(self, raw_cards: Any) -> list[PhraseCardDraft]:
        if not isinstance(raw_cards, list):
            return []

        drafts: list[PhraseCardDraft] = []
        for raw_card in raw_cards[:MAX_PHRASE_CARDS]:
            if not isinstance(raw_card, dict):
                continue

            source_text = self._cleanup_text(str(raw_card.get("source_text", "")))
            english_expression = self._cleanup_text(
                str(raw_card.get("english_expression", ""))
            )
            tone_tag = self._cleanup_text(str(raw_card.get("tone_tag", "")))
            usage_note = self._cleanup_text(str(raw_card.get("usage_note", "")))

            if not all([source_text, english_expression, tone_tag, usage_note]):
                continue

            drafts.append(
                PhraseCardDraft(
                    source_text=source_text,
                    english_expression=english_expression,
                    tone_tag=tone_tag,
                    usage_note=usage_note,
                )
            )

        if len(drafts) < MIN_PHRASE_CARDS:
            return []

        return drafts

    def _build_fallback_card(self, candidate: dict[str, str]) -> PhraseCardDraft:
        source_text = candidate["text"]
        english_expression = self._cleanup_english_expression(source_text)
        tone_tag = self._infer_tone_tag(source_text)
        usage_note = self._build_usage_note(source_text)

        return PhraseCardDraft(
            source_text=source_text,
            english_expression=english_expression,
            tone_tag=tone_tag,
            usage_note=usage_note,
        )

    def _cleanup_english_expression(self, text: str) -> str:
        cleaned = self._cleanup_text(text)
        if not cleaned:
            return cleaned
        if cleaned[-1] not in ".!?":
            cleaned = f"{cleaned}."
        return cleaned[0].upper() + cleaned[1:]

    def _infer_tone_tag(self, text: str) -> str:
        lowered = text.lower()
        if "?" in text:
            return "curious"
        if "!" in text:
            return "energetic"
        if re.search(r"\b(love|excited|fun|great|happy)\b", lowered):
            return "warm"
        if re.search(r"\b(think|guess|maybe|probably)\b", lowered):
            return "reflective"
        return "casual"

    def _build_usage_note(self, text: str) -> str:
        if "?" in text:
            return "Use this when you want to ask naturally while keeping your personal tone."
        if _FIRST_PERSON_RE.search(text):
            return "Use this to express your own habits, feelings, or preferences in a natural way."
        return "Use this for a short, conversational line that still sounds like you."
