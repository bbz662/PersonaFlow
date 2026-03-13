import type { AudioChunk } from "./audio-io-chunk.ts";
import type { AudioIO, AudioIOCallbacks } from "./audio-io.ts";
import { createSineWaveChunk } from "./audio-io-chunk.ts";

export class MockAudioIO implements AudioIO {
  readonly kind = "mock" as const;

  private readonly callbacks: AudioIOCallbacks;
  private inputInterval: ReturnType<typeof globalThis.setInterval> | null = null;
  private playbackTimers = new Set<ReturnType<typeof globalThis.setTimeout>>();
  private inputPhase = 0;
  private isPlaying = false;

  constructor(callbacks: AudioIOCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async startInput() {
    if (this.inputInterval) {
      return;
    }

    this.inputInterval = globalThis.setInterval(() => {
      const chunk = createSineWaveChunk({
        sampleRate: 16_000,
        durationMs: 120,
        frequencyHz: 180,
        amplitude: 0.12,
        phaseOffset: this.inputPhase,
      });

      this.inputPhase += chunk.samples.length;
      this.callbacks.onInputChunk?.(chunk);
    }, 160);
  }

  async stopInput() {
    if (!this.inputInterval) {
      return;
    }

    globalThis.clearInterval(this.inputInterval);
    this.inputInterval = null;
  }

  async pushPlaybackChunk(chunk: AudioChunk) {
    this.updatePlaybackState(true);

    const durationMs = Math.max(40, Math.round((chunk.samples.length / chunk.sampleRate) * 1000));
    const timer = globalThis.setTimeout(() => {
      this.playbackTimers.delete(timer);
      if (this.playbackTimers.size === 0) {
        this.updatePlaybackState(false);
      }
    }, durationMs);

    this.playbackTimers.add(timer);
  }

  flushPlayback() {
    for (const timer of this.playbackTimers) {
      globalThis.clearTimeout(timer);
    }

    this.playbackTimers.clear();
    this.updatePlaybackState(false);
  }

  async dispose() {
    await this.stopInput();
    this.flushPlayback();
  }

  private updatePlaybackState(playing: boolean) {
    if (this.isPlaying === playing) {
      return;
    }

    this.isPlaying = playing;
    this.callbacks.onPlaybackStateChange?.(playing);
  }
}
