export class EventSink {
    tick = 0;
    events = [];
    death(cellId, x, y, team) {
        this.events.push({ type: "death", tick: this.tick, cellId, x, y, team });
    }
    kill(killerTeam, victimTeam) {
        this.events.push({ type: "kill", tick: this.tick, killerTeam, victimTeam });
    }
    explosion(x, y, team) {
        this.events.push({ type: "explosion", tick: this.tick, x, y, team });
    }
    fire(team) { this.events.push({ type: "projectileFire", tick: this.tick, team }); }
    leadChange(team) { this.events.push({ type: "leadChange", tick: this.tick, team }); }
    end(winner) { this.events.push({ type: "battleEnd", tick: this.tick, winner }); }
}
