import type { AudioChunk } from "./audio-io-chunk.ts";
import type { AudioIO, AudioIOCallbacks } from "./audio-io.ts";

export class BrowserAudioIO implements AudioIO {
  readonly kind = "browser" as const;

  private readonly callbacks: AudioIOCallbacks;
  private audioContext: AudioContext | null = null;
  private inputStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private inputSink: GainNode | null = null;
  private playbackCursorSeconds = 0;
  private activePlaybackSources = new Set<AudioBufferSourceNode>();
  private isPlaying = false;

  constructor(callbacks: AudioIOCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async startInput() {
    if (this.inputStream) {
      await this.resumeContext();
      return;
    }

    const context = this.ensureAudioContext();
    await this.resumeContext();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor keeps the MVP adapter small without introducing AudioWorklet setup.
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const inputSamples = event.inputBuffer.getChannelData(0);
      this.callbacks.onInputChunk?.({
        sampleRate: event.inputBuffer.sampleRate,
        samples: new Float32Array(inputSamples),
      });
    };

    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);

    this.inputStream = stream;
    this.inputSource = source;
    this.inputProcessor = processor;
    this.inputSink = sink;
  }

  async stopInput() {
    this.inputProcessor?.disconnect();
    this.inputSource?.disconnect();
    this.inputSink?.disconnect();
    this.inputStream?.getTracks().forEach((track) => track.stop());

    this.inputProcessor = null;
    this.inputSource = null;
    this.inputSink = null;
    this.inputStream = null;
  }

  async pushPlaybackChunk(chunk: AudioChunk) {
    const context = this.ensureAudioContext();
    await this.resumeContext();

    const buffer = context.createBuffer(1, chunk.samples.length, chunk.sampleRate);
    buffer.copyToChannel(chunk.samples, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime, this.playbackCursorSeconds);
    this.playbackCursorSeconds = startAt + buffer.duration;

    this.activePlaybackSources.add(source);
    this.updatePlaybackState(true);

    source.onended = () => {
      this.activePlaybackSources.delete(source);
      if (this.activePlaybackSources.size === 0 && this.playbackCursorSeconds <= context.currentTime + 0.01) {
        this.playbackCursorSeconds = context.currentTime;
        this.updatePlaybackState(false);
      }
    };

    source.start(startAt);
  }

  flushPlayback() {
    for (const source of this.activePlaybackSources) {
      source.stop();
    }

    this.activePlaybackSources.clear();

    if (this.audioContext) {
      this.playbackCursorSeconds = this.audioContext.currentTime;
    } else {
      this.playbackCursorSeconds = 0;
    }

    this.updatePlaybackState(false);
  }

  async dispose() {
    await this.stopInput();
    this.flushPlayback();

    if (this.audioContext) {
      const context = this.audioContext;
      this.audioContext = null;
      await context.close();
    }
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.playbackCursorSeconds = this.audioContext.currentTime;
    }

    return this.audioContext;
  }

  private async resumeContext() {
    const context = this.ensureAudioContext();

    if (context.state === "suspended") {
      await context.resume();
    }
  }

  private updatePlaybackState(playing: boolean) {
    if (this.isPlaying === playing) {
      return;
    }

    this.isPlaying = playing;
    this.callbacks.onPlaybackStateChange?.(playing);
  }
}
