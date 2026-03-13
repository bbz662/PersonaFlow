import assert from "node:assert/strict";
import test from "node:test";

import { MockAudioIO } from "./audio-io-mock.ts";

test("mock audio input emits chunks once capture starts", async () => {
  let chunkCount = 0;

  const audio = new MockAudioIO({
    onInputChunk: (chunk) => {
      chunkCount += 1;
      assert.equal(chunk.sampleRate, 16_000);
      assert.ok(chunk.samples.length > 0);
    },
  });

  await audio.startInput();
  await new Promise((resolve) => setTimeout(resolve, 380));
  await audio.stopInput();

  assert.ok(chunkCount >= 2);
});

test("mock playback can be flushed immediately for interruption handling", async () => {
  const playbackStates: boolean[] = [];

  const audio = new MockAudioIO({
    onPlaybackStateChange: (playing) => {
      playbackStates.push(playing);
    },
  });

  await audio.pushPlaybackChunk({
    sampleRate: 16_000,
    samples: new Float32Array(3_200),
  });

  audio.flushPlayback();

  assert.deepEqual(playbackStates, [true, false]);
});

test("disposing mock audio stops further input activity", async () => {
  let chunkCount = 0;

  const audio = new MockAudioIO({
    onInputChunk: () => {
      chunkCount += 1;
    },
  });

  await audio.startInput();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await audio.dispose();

  const countAfterDispose = chunkCount;
  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(chunkCount, countAfterDispose);
});
