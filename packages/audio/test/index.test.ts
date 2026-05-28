import { describe, test, expect } from "vitest";
import { runBattle, normalizeConfig } from "@cellstorm/sim";
import { renderBattleAudioWav, buildAudioScore } from "../src/index";

describe("renderBattleAudioWav (end to end on a real battle)", () => {
  test("produces a WAV sized to the battle's video length", () => {
    const cfg = normalizeConfig({ seed: 7, teamCount: 3, powers: ["Bomb", "Sniper", "Tank"] });
    const { log } = runBattle(cfg);
    const fps = 60;
    const sampleRate = 22050;
    const wav = renderBattleAudioWav(log, fps, sampleRate);

    // RIFF/WAVE magic
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");

    // data bytes ≈ frames * 4; frames ≈ duration * sampleRate
    const dataBytes = wav[40]! | (wav[41]! << 8) | (wav[42]! << 16) | (wav[43]! << 24);
    const expectedFrames = Math.ceil((log.totalTicks / fps) * sampleRate);
    expect(dataBytes).toBe(expectedFrames * 4);
  });

  test("is deterministic for a seed", () => {
    const cfg = normalizeConfig({ seed: 7, teamCount: 2, powers: ["Glasshammer", "Tank"] });
    const { log } = runBattle(cfg);
    const a = renderBattleAudioWav(log, 60, 22050);
    const b = renderBattleAudioWav(log, 60, 22050);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test("a real battle yields a non-trivial score (events + bed)", () => {
    const cfg = normalizeConfig({ seed: 7, teamCount: 3, powers: ["Bomb", "Sniper", "Tank"] });
    const { log } = runBattle(cfg);
    const score = buildAudioScore(log, 60);
    expect(score.notes.length).toBeGreaterThan(20);
  });
});
