import { describe, test, expect } from "vitest";
import { pcmToWav } from "../src/wav";

// Read a little-endian uint32 from a Uint8Array.
function u32(b: Uint8Array, off: number): number {
  return (b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16) | (b[off + 3]! << 24)) >>> 0;
}
function u16(b: Uint8Array, off: number): number {
  return b[off]! | (b[off + 1]! << 8);
}
function ascii(b: Uint8Array, off: number, len: number): string {
  return String.fromCharCode(...b.slice(off, off + len));
}
// Signed 16-bit LE.
function s16(b: Uint8Array, off: number): number {
  const v = b[off]! | (b[off + 1]! << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

describe("pcmToWav", () => {
  test("writes a canonical 44-byte stereo 16-bit header", () => {
    const left = new Float32Array([0, 0]);
    const right = new Float32Array([0, 0]);
    const wav = pcmToWav(left, right, 44100);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(u32(wav, 16)).toBe(16); // PCM fmt chunk size
    expect(u16(wav, 20)).toBe(1); // audio format = PCM
    expect(u16(wav, 22)).toBe(2); // channels = stereo
    expect(u32(wav, 24)).toBe(44100); // sample rate
    expect(u16(wav, 32)).toBe(4); // block align = channels * bytesPerSample
    expect(u16(wav, 34)).toBe(16); // bits per sample
    expect(ascii(wav, 36, 4)).toBe("data");
  });

  test("byte length = 44 header + 4 bytes per stereo frame", () => {
    const left = new Float32Array(10);
    const right = new Float32Array(10);
    const wav = pcmToWav(left, right, 44100);
    expect(wav.length).toBe(44 + 10 * 4);
    expect(u32(wav, 40)).toBe(10 * 4); // data chunk size
    expect(u32(wav, 4)).toBe(36 + 10 * 4); // RIFF chunk size
  });

  test("interleaves L/R and scales [-1,1] floats to full-scale 16-bit", () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([0, 0.5]);
    const wav = pcmToWav(left, right, 44100);
    // frame 0: L=1 -> 32767, R=0 -> 0
    expect(s16(wav, 44)).toBe(32767);
    expect(s16(wav, 46)).toBe(0);
    // frame 1: L=-1 -> -32768, R=0.5 -> ~16383
    expect(s16(wav, 48)).toBe(-32768);
    expect(s16(wav, 50)).toBe(Math.round(0.5 * 32767));
  });

  test("clamps out-of-range samples instead of wrapping", () => {
    const left = new Float32Array([2, -3]);
    const right = new Float32Array([0, 0]);
    const wav = pcmToWav(left, right, 44100);
    expect(s16(wav, 44)).toBe(32767); // +2 clamps to max
    expect(s16(wav, 48)).toBe(-32768); // -3 clamps to min
  });
});
