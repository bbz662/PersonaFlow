import type { RealtimeToolCallEvent } from "./realtime-session-client.ts";

export const PHRASE_CARD_TOOL_NAME = "generate_phrase_card_preview" as const;
const TOOL_TIMEOUT_MS = 8_000;

type PhraseCardPreviewArgs = {
  utterance_text: string;
  source_language: string;
  turn_index: number;
};

type PhraseCardPreviewCard = {
  card_id: string;
  source_text: string;
  english_expression: string;
  tone_tag: string;
  usage_note: string;
  created_at: string;
};

export type PhraseCardPreviewResult = {
  tool_name: typeof PHRASE_CARD_TOOL_NAME;
  summary: string;
  card_count: number;
  cards: PhraseCardPreviewCard[];
};

export type ToolBridgeContext = {
  sessionId: string;
  apiBaseUrl: string;
};

export type ToolBridgeDispatchSuccess = {
  status: "completed";
  result: PhraseCardPreviewResult;
};

export type ToolBridgeDispatchFailure = {
  status: "failed";
  code: "unsupported_tool" | "bad_arguments" | "timeout" | "request_failed";
  message: string;
};

export type ToolBridgeDispatchResult =
  | ToolBridgeDispatchSuccess
  | ToolBridgeDispatchFailure;

function readPhraseCardPreviewArgs(
  argumentsPayload: Record<string, unknown>,
): PhraseCardPreviewArgs | null {
  const utteranceText = argumentsPayload.utterance_text;
  const sourceLanguage = argumentsPayload.source_language;
  const turnIndex = argumentsPayload.turn_index;

  if (
    typeof utteranceText !== "string" ||
    !utteranceText.trim() ||
    typeof sourceLanguage !== "string" ||
    !sourceLanguage.trim() ||
    typeof turnIndex !== "number"
  ) {
    return null;
  }

  return {
    utterance_text: utteranceText.trim(),
    source_language: sourceLanguage.trim(),
    turn_index: turnIndex,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let message = "PersonaFlow could not complete the tool request.";

  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      message = payload.detail;
    }
  } catch {
    // Fall back to the default message when the error response is empty.
  }

  throw new Error(message);
}

export class PersonaFlowToolBridge {
  async dispatch(
    request: RealtimeToolCallEvent,
    context: ToolBridgeContext,
  ): Promise<ToolBridgeDispatchResult> {
    if (request.name !== PHRASE_CARD_TOOL_NAME) {
      return {
        status: "failed",
        code: "unsupported_tool",
        message: `Unsupported tool request: ${request.name}.`,
      };
    }

    const args = readPhraseCardPreviewArgs(request.arguments);
    if (!args) {
      return {
        status: "failed",
        code: "bad_arguments",
        message: "Phrase card preview requests need utterance_text, source_language, and turn_index.",
      };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${context.apiBaseUrl}/sessions/${context.sessionId}/tools/phrase-card-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        },
      );

      const result = await readJson<PhraseCardPreviewResult>(response);
      return { status: "completed", result };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          status: "failed",
          code: "timeout",
          message: "Phrase card preview timed out in the live session.",
        };
      }

      return {
        status: "failed",
        code: "request_failed",
        message:
          error instanceof Error
            ? error.message
            : "Phrase card preview failed in the live session.",
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
