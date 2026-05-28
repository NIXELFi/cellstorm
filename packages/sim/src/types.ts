export interface Power {
  name: string;
  hp?: number; speed?: number; damage?: number; radius?: number;
  aggro?: boolean; hold?: boolean; healer?: boolean;
  heal?: number; regen?: number; auraHeal?: number; auraR?: number;
  multiply?: number; explode?: boolean; explodeDmg?: number; explodeR2?: number;
  shoot?: boolean; shootCD?: number; projDamage?: number; projSpeed?: number;
  pull?: boolean; pullR?: number;
  revive?: boolean; reviveCD?: number;
  infect?: number; plagueDPS?: number; stun?: number;
  dmgReduce?: number; reflect?: number; frenzy?: boolean;
  charge?: boolean; chargeCD?: number; chargeBurst?: number; chargeForce?: number;
}

export interface Cell {
  id: number; team: number;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; radius: number;
  alive: boolean;
  state: "engage" | "retreat" | "regroup" | "hunt";
  aiPhase: number;
  tx: number | null; ty: number | null;
  acx: number | null; acy: number | null; avx: number; avy: number;
  stunT: number; plagueT: number;
  cdShoot: number; cdCharge: number; cdRevive: number; dash: number;
}

export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  team: number; damage: number; life: number;
}

export interface Corpse { x: number; y: number; team: number; age: number; }

export interface ArenaParams { width: number; height: number; }

/**
 * Tunable AI / aggression parameters. Defaults reproduce the original prototype behavior;
 * higher engage forces, a lower retreat threshold, and a non-zero huntCenterBias make battles
 * more decisive (fewer stalemates). These are sim knobs, not scoring (goal) settings.
 */
export interface AiParams {
  perceptionR2: number;     // squared perception radius for the AI scan
  scanWindow: number;       // grid cells scanned each direction (perf vs reach)
  engageForce: number;      // steering force toward target when engaging (non-aggro)
  aggroEngageForce: number; // steering force for aggro powers
  retreatHpFrac: number;    // retreat below this hp fraction (0 disables retreat)
  flockWeight: number;      // boids velocity alignment toward allies
  huntCenterBias: number;   // when no enemy is seen, pull toward arena center (0 = pure wander)
  stalemateTicks: number;   // ticks without an elimination before declaring a stalemate
  damageScale: number;      // global melee lethality multiplier (lower = longer battles)
}

export interface BattleConfig {
  seed: number;
  teamCount: number;
  powers: string[];        // power name per team, length === teamCount
  totalCells: number;      // default 900
  arena: ArenaParams;      // default 280x498 (will scale at render time)
  maxTicks: number;        // hard cap
  ai: AiParams;            // aggression / decisiveness tuning
}

export interface TeamCountSnapshot { tick: number; counts: number[]; }
