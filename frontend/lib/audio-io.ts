import { BrowserAudioIO } from "./audio-io-browser.ts";
import { MockAudioIO } from "./audio-io-mock.ts";
import { createSineWaveChunk, type AudioChunk } from "./audio-io-chunk.ts";

export type { AudioChunk } from "./audio-io-chunk.ts";
export { createSineWaveChunk } from "./audio-io-chunk.ts";

export type AudioIOCallbacks = {
  onInputChunk?: (chunk: AudioChunk) => void;
  onPlaybackStateChange?: (playing: boolean) => void;
};

export type AudioIOMode = "browser" | "mock";

export interface AudioIO {
  readonly kind: AudioIOMode;
  startInput(): Promise<void>;
  stopInput(): Promise<void>;
  pushPlaybackChunk(chunk: AudioChunk): Promise<void>;
  flushPlayback(): void;
  dispose(): Promise<void>;
}

export function createAudioIO({
  mode,
  callbacks,
}: {
  mode: AudioIOMode;
  callbacks?: AudioIOCallbacks;
}): AudioIO {
  if (mode === "browser") {
    return new BrowserAudioIO(callbacks);
  }

  return new MockAudioIO(callbacks);
}
