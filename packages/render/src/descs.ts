// Short, punchy power blurbs for the broadcast HUD (side panel + intro card). One line each.
export const POWER_DESC: Record<string, string> = {
  Berserker: "Relentless — fast and hard-hitting",
  Tank: "Massive HP, holds the line",
  Vampire: "Heals by dealing damage",
  Splitter: "Clones itself on every kill",
  Bomb: "Explodes violently on death",
  Swift: "Blazing speed, glass-thin",
  Brute: "Slow, but hits like a truck",
  Sniper: "Picks off targets from range",
  Magnet: "Drags enemies into the brawl",
  Necromancer: "Raises fallen allies",
  Plague: "Infects enemies with deadly rot",
  Shielder: "Shrugs off half of all damage",
  Regen: "Heals itself nonstop",
  Frenzy: "Hits harder the closer to death",
  Lifebloom: "Heals every nearby ally",
  Charger: "Dashes in for burst damage",
  Goliath: "Colossal bruiser, brutally tanky",
  Reflector: "Returns damage to attackers",
  Stunner: "Freezes enemies in place",
  Glasshammer: "One devastating hit, then shatters",
};

export function powerDesc(name: string): string {
  return POWER_DESC[name] ?? "";
}
