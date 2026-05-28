import type { Power } from "./types";

// Stats tuned via the 1v1 balance study (see apps/lab/balanceStudy.mts) to compress the win-rate
// spread. Values in comments are the originals. Damage/heal are scaled globally by ai.damageScale.
export const POWERS: Power[] = [
  { name: "Berserker", speed: 1.45, damage: 1.6, aggro: true },
  { name: "Tank", hp: 1.82, speed: 0.6, radius: 1.3, damage: 0.95, hold: true }, // orig hp2.4 r1.35 dmg1.2
  { name: "Vampire", heal: 0.85, healer: true },
  { name: "Splitter", multiply: 0.75 }, // orig 0.55
  { name: "Bomb", explode: true, explodeDmg: 3.5, explodeR2: 620, aggro: true }, // orig 7/800 hardcoded
  { name: "Swift", speed: 1.7, hp: 0.95, damage: 1.65 }, // orig speed1.85 hp0.75 nodmg
  { name: "Brute", damage: 1.75, speed: 0.9, radius: 1.15, aggro: true }, // orig dmg2
  { name: "Sniper", shoot: true, shootCD: 36, projDamage: 7, projSpeed: 4.8, hp: 1.25 }, // buffed from 5%
  { name: "Magnet", pull: true, pullR: 60, hp: 1.4, damage: 1.35 }, // ~50% now
  { name: "Necromancer", revive: true, reviveCD: 240, hp: 0.9 }, // orig cd90
  { name: "Plague", infect: 280, plagueDPS: 0.34, hp: 1.55 }, // bulk to survive & spread (kite-power vs retreat-off)
  { name: "Shielder", dmgReduce: 0.42, speed: 0.85 }, // orig 0.5
  { name: "Regen", regen: 0.3, hp: 1.2 }, // orig 0.18
  { name: "Frenzy", frenzy: true, speed: 1.1 },
  { name: "Lifebloom", auraHeal: 0.075, auraR: 22, damage: 0.8 }, // hard nerf — aura stacks across team
  { name: "Charger", charge: true, chargeCD: 45, chargeBurst: 5.5, chargeForce: 2.8, aggro: true }, // buffed from 15%
  { name: "Goliath", radius: 1.2, hp: 1.55, damage: 1.1, speed: 0.58, hold: true }, // orig r2.4 hp3.5 dmg2 — radius was the dominator
  { name: "Reflector", reflect: 0.34, hp: 1.2, speed: 0.85 }, // orig reflect0.55 hp1.3
  { name: "Stunner", stun: 42, speed: 1.05, damage: 1.6 }, // buffed from 11%
  { name: "Glasshammer", damage: 3.3, hp: 0.46, speed: 1.3, aggro: true }, // orig hp0.42
];

const BY_NAME = new Map(POWERS.map((p) => [p.name, p]));
export function powerByName(name: string): Power {
  const p = BY_NAME.get(name);
  if (!p) throw new Error(`Unknown power: ${name}`);
  return p;
}
export const POWER_NAMES = POWERS.map((p) => p.name);
