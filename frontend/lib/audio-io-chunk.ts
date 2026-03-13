export type AudioChunk = {
  sampleRate: number;
  samples: Float32Array;
};

export function createSineWaveChunk({
  sampleRate = 24_000,
  durationMs = 180,
  frequencyHz = 220,
  amplitude = 0.25,
  phaseOffset = 0,
}: {
  sampleRate?: number;
  durationMs?: number;
  frequencyHz?: number;
  amplitude?: number;
  phaseOffset?: number;
} = {}): AudioChunk {
  const frameCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const samples = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = (index + phaseOffset) / sampleRate;
    samples[index] = amplitude * Math.sin(2 * Math.PI * frequencyHz * time);
  }

  return {
    sampleRate,
    samples,
  };
}
