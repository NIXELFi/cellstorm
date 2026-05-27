export type SimEvent =
  | { type: "death"; tick: number; cellId: number; x: number; y: number; team: number }
  | { type: "kill"; tick: number; killerTeam: number; victimTeam: number }
  | { type: "explosion"; tick: number; x: number; y: number; team: number }
  | { type: "projectileFire"; tick: number; team: number }
  | { type: "leadChange"; tick: number; team: number }
  | { type: "battleEnd"; tick: number; winner: number };

export class EventSink {
  tick = 0;
  events: SimEvent[] = [];
  death(cellId: number, x: number, y: number, team: number) {
    this.events.push({ type: "death", tick: this.tick, cellId, x, y, team });
  }
  kill(killerTeam: number, victimTeam: number) {
    this.events.push({ type: "kill", tick: this.tick, killerTeam, victimTeam });
  }
  explosion(x: number, y: number, team: number) {
    this.events.push({ type: "explosion", tick: this.tick, x, y, team });
  }
  fire(team: number) { this.events.push({ type: "projectileFire", tick: this.tick, team }); }
  leadChange(team: number) { this.events.push({ type: "leadChange", tick: this.tick, team }); }
  end(winner: number) { this.events.push({ type: "battleEnd", tick: this.tick, winner }); }
}
