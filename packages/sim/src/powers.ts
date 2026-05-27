import type { Power } from "./types";

export const POWERS: Power[] = [
  { name: "Berserker", speed: 1.45, damage: 1.6, aggro: true },
  { name: "Tank", hp: 2.4, speed: 0.6, radius: 1.35, damage: 1.2, hold: true },
  { name: "Vampire", heal: 0.85, healer: true },
  { name: "Splitter", multiply: 0.55 },
  { name: "Bomb", explode: true, aggro: true },
  { name: "Swift", speed: 1.85, hp: 0.75 },
  { name: "Brute", damage: 2, speed: 0.9, radius: 1.15, aggro: true },
  { name: "Sniper", shoot: true, shootCD: 55, projDamage: 3.5, projSpeed: 4.2, hp: 0.8 },
  { name: "Magnet", pull: true, pullR: 60, hp: 1.1 },
  { name: "Necromancer", revive: true, reviveCD: 90, hp: 0.9 },
  { name: "Plague", infect: 200, plagueDPS: 0.07 },
  { name: "Shielder", dmgReduce: 0.5, speed: 0.85 },
  { name: "Regen", regen: 0.18, hp: 1.2 },
  { name: "Frenzy", frenzy: true, speed: 1.1 },
  { name: "Lifebloom", auraHeal: 0.35, auraR: 32, damage: 0.85 },
  { name: "Charger", charge: true, chargeCD: 75, chargeBurst: 3.2, chargeForce: 2.6, aggro: true },
  { name: "Goliath", radius: 2.4, hp: 3.5, damage: 2, speed: 0.48, hold: true },
  { name: "Reflector", reflect: 0.55, hp: 1.3, speed: 0.85 },
  { name: "Stunner", stun: 26, speed: 1.05 },
  { name: "Glasshammer", damage: 3.3, hp: 0.42, speed: 1.3, aggro: true },
];

const BY_NAME = new Map(POWERS.map((p) => [p.name, p]));
export function powerByName(name: string): Power {
  const p = BY_NAME.get(name);
  if (!p) throw new Error(`Unknown power: ${name}`);
  return p;
}
export const POWER_NAMES = POWERS.map((p) => p.name);
