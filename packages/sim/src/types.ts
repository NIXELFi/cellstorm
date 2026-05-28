export interface Power {
  name: string;
  hp?: number; speed?: number; damage?: number; radius?: number;
  aggro?: boolean; hold?: boolean; healer?: boolean;
  heal?: number; regen?: number; auraHeal?: number; auraR?: number;
  multiply?: number; explode?: boolean;
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

export interface BattleConfig {
  seed: number;
  teamCount: number;
  powers: string[];        // power name per team, length === teamCount
  totalCells: number;      // default 900
  arena: ArenaParams;      // default 280x498 (will scale at render time)
  maxTicks: number;        // hard cap
}

export interface TeamCountSnapshot { tick: number; counts: number[]; }
