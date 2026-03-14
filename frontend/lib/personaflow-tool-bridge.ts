import type { RealtimeToolCallEvent } from "./realtime-session-client.ts";
import type {
  RealtimeLogFields,
  RealtimeLogLevel,
} from "./realtime-observability.ts";

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

type VoiceAgentToolExecutionResponse = {
  request_id: string;
  session_id: string;
  tool_name: typeof PHRASE_CARD_TOOL_NAME;
  status: "completed";
  result: {
    summary: string;
    card_count: number;
    cards: PhraseCardPreviewCard[];
  };
};

type VoiceAgentToolErrorResponse = {
  request_id: string;
  error?: {
    code?: string;
    message?: string;
  };
};

class ToolBridgeRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ToolBridgeRequestError";
  }
}

export type ToolBridgeContext = {
  sessionId: string;
  apiBaseUrl: string;
  observe?: (event: string, options?: { level?: RealtimeLogLevel; fields?: RealtimeLogFields }) => void;
};

export type ToolBridgeDispatchSuccess = {
  status: "completed";
  requestId: string;
  durationMs: number;
  result: PhraseCardPreviewResult;
};

export type ToolBridgeDispatchFailure = {
  status: "failed";
  code: "unsupported_tool" | "bad_arguments" | "timeout" | "request_failed";
  message: string;
  requestId: string | null;
  durationMs: number;
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
  let code = "request_failed";

  try {
    const payload = (await response.json()) as
      | VoiceAgentToolErrorResponse
      | { detail?: string };
    if ("error" in payload && payload.error?.message) {
      message = payload.error.message;
      code = payload.error.code ?? code;
    } else if ("detail" in payload && payload.detail) {
      message = payload.detail;
    }
  } catch {
    // Fall back to the default message when the error response is empty.
  }

  throw new ToolBridgeRequestError(message, code);
}

export class PersonaFlowToolBridge {
  async dispatch(
    request: RealtimeToolCallEvent,
    context: ToolBridgeContext,
  ): Promise<ToolBridgeDispatchResult> {
    const startedAt = performance.now();

    if (request.name !== PHRASE_CARD_TOOL_NAME) {
      context.observe?.("voice.tool.invocation.rejected", {
        level: "warn",
        fields: {
          tool_call_id: request.callId,
          tool_name: request.name,
          reason: "unsupported_tool",
        },
      });
      return {
        status: "failed",
        code: "unsupported_tool",
        message: `Unsupported tool request: ${request.name}.`,
        requestId: null,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    const args = readPhraseCardPreviewArgs(request.arguments);
    if (!args) {
      context.observe?.("voice.tool.invocation.rejected", {
        level: "warn",
        fields: {
          tool_call_id: request.callId,
          tool_name: request.name,
          reason: "bad_arguments",
        },
      });
      return {
        status: "failed",
        code: "bad_arguments",
        message: "Phrase card preview requests need utterance_text, source_language, and turn_index.",
        requestId: null,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
    const requestId = crypto.randomUUID();

    context.observe?.("voice.tool.invocation.requested", {
      fields: {
        tool_call_id: request.callId,
        tool_request_id: requestId,
        tool_name: request.name,
        turn_index: args.turn_index,
        utterance_length: args.utterance_text.length,
      },
    });

    try {
      const response = await fetch(
        `${context.apiBaseUrl}/voice-agent/tools/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
          body: JSON.stringify({
            session_id: context.sessionId,
            tool_name: PHRASE_CARD_TOOL_NAME,
            arguments: args,
          }),
          signal: controller.signal,
        },
      );

      const payload = await readJson<VoiceAgentToolExecutionResponse>(response);
      return {
        status: "completed",
        requestId: payload.request_id,
        durationMs: Math.round(performance.now() - startedAt),
        result: {
          tool_name: payload.tool_name,
          summary: payload.result.summary,
          card_count: payload.result.card_count,
          cards: payload.result.cards,
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          status: "failed",
          code: "timeout",
          message: "Phrase card preview timed out in the live session.",
          requestId,
          durationMs: Math.round(performance.now() - startedAt),
        };
      }

      return {
        status: "failed",
        code:
          error instanceof ToolBridgeRequestError &&
          (error.code === "invalid_request" || error.code === "tool_execution_failed")
            ? "bad_arguments"
            : error instanceof ToolBridgeRequestError && error.code === "unsupported_tool"
              ? "unsupported_tool"
              : "request_failed",
        message:
          error instanceof Error
            ? error.message
            : "Phrase card preview failed in the live session.",
        requestId,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
