function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const realtimeVoiceEnabled = envFlag(
  "NEXT_PUBLIC_REALTIME_VOICE_ENABLED",
  true,
);

export const defaultRealtimeAudioMode =
  process.env.NEXT_PUBLIC_REALTIME_AUDIO_MODE === "browser" ? "browser" : "mock";
