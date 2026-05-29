import { describe, it, expect } from "vitest";
import { runTournament } from "../src/tournament";
import {
  buildIntroPayload,
  buildBeatPayloads,
  buildChampionPayload,
  buildPodiumPayload,
} from "../src/scene/sceneData";

describe("sceneData", () => {
  const result = runTournament(1, { seedsPerMatch: 2, finaleBudget: 4 });

  it("intro lists 16 entrants and an undecided bracket", () => {
    const p = buildIntroPayload(result);
    expect(p.entrants).toHaveLength(16);
    expect(p.bracket.ro16).toHaveLength(8);
    expect(p.bracket.ro16.every((m) => m.winnerTeam === null)).toBe(true);
    expect(p.bracket.ro16[0]!.top).not.toBeNull(); // ro16 entrants are always known
    expect(p.bracket.qf.every((m) => m.top === null)).toBe(true); // qf TBD before any match
  });

  it("produces 14 beats that progressively reveal winners", () => {
    const beats = buildBeatPayloads(result);
    expect(beats).toHaveLength(14);
    expect(beats[0]!.bracket.ro16[0]!.winnerTeam).not.toBeNull();
    expect(beats[0]!.bracket.ro16[1]!.winnerTeam).toBeNull();
    const last = beats[13]!.bracket;
    expect(last.ro16.every((m) => m.winnerTeam !== null)).toBe(true);
    expect(last.qf.every((m) => m.winnerTeam !== null)).toBe(true);
    expect(last.sf.every((m) => m.winnerTeam !== null)).toBe(true);
    expect(last.final.winnerTeam).toBeNull(); // final isn't decided during SF beats
  });

  it("champion beat reveals the winner; podium carries the top finishers", () => {
    const champ = buildChampionPayload(result);
    expect(champ.bracket.champion).toBe(result.champion);
    expect(champ.bracket.final.winnerTeam).not.toBeNull();
    const podium = buildPodiumPayload(result);
    expect(podium.champion).toBe(result.champion);
    expect(podium.runnerUp).toBe(result.runnerUp);
    expect(podium.champion).not.toBe(podium.runnerUp);
  });
});
