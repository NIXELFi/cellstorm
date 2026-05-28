// Encode stereo float PCM into a canonical 16-bit little-endian WAV (RIFF/WAVE). Pure: returns a
// Uint8Array usable by Node `writeFile` and the browser (`Blob`/`decodeAudioData`). Samples outside
// [-1, 1] are clamped (not wrapped) so a hot mix degrades gracefully instead of crackling.

function clampSample(x: number): number {
  if (x > 1) x = 1;
  else if (x < -1) x = -1;
  // Map [-1,1] -> [-32768, 32767]. Positive scales by 32767, negative by 32768.
  return x < 0 ? Math.round(x * 32768) : Math.round(x * 32767);
}

export function pcmToWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const channels = 2;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const writeAscii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(off, clampSample(left[i]!), true);
    view.setInt16(off + 2, clampSample(right[i]!), true);
    off += 4;
  }
  return bytes;
}
