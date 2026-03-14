"use client";

export type RealtimeLogLevel = "info" | "warn" | "error";

export type RealtimeLogValue = string | number | boolean | null | undefined;

export type RealtimeLogFields = Record<string, RealtimeLogValue>;

export type RealtimeLogEntry = {
  timestamp: string;
  scope: "frontend";
  event: string;
  level: RealtimeLogLevel;
  session_id: string;
  fields: RealtimeLogFields;
};

type CreateRealtimeLogEntryOptions = {
  event: string;
  level?: RealtimeLogLevel;
  sessionId: string;
  fields?: RealtimeLogFields;
};

export function createRealtimeLogEntry(
  options: CreateRealtimeLogEntryOptions,
): RealtimeLogEntry {
  return {
    timestamp: new Date().toISOString(),
    scope: "frontend",
    event: options.event,
    level: options.level ?? "info",
    session_id: options.sessionId,
    fields: options.fields ?? {},
  };
}

export function writeRealtimeLog(entry: RealtimeLogEntry) {
  const writer =
    entry.level === "error"
      ? console.error
      : entry.level === "warn"
        ? console.warn
        : console.info;

  writer("[personaflow.realtime]", JSON.stringify(entry));
}
