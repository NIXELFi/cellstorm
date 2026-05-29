import { describe, it, expect } from "vitest";
import { silentWavBytes } from "../src/render/silentWav";

describe("silentWavBytes", () => {
  it("emits a 44.1kHz / 16-bit / stereo WAV header with the right length", () => {
    const sr = 44100;
    const bytes = silentWavBytes(1, sr);
    const ascii = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(sr); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    const frames = Math.ceil(1 * sr);
    expect(bytes.length).toBe(44 + frames * 4); // 2ch * 2 bytes/sample
  });

  it("is silent (all sample bytes zero)", () => {
    const bytes = silentWavBytes(0.05);
    expect(bytes.slice(44).every((b) => b === 0)).toBe(true);
  });
});
