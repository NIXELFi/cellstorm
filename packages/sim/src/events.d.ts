export type SimEvent = {
    type: "death";
    tick: number;
    cellId: number;
    x: number;
    y: number;
    team: number;
} | {
    type: "kill";
    tick: number;
    killerTeam: number;
    victimTeam: number;
} | {
    type: "explosion";
    tick: number;
    x: number;
    y: number;
    team: number;
} | {
    type: "projectileFire";
    tick: number;
    team: number;
} | {
    type: "leadChange";
    tick: number;
    team: number;
} | {
    type: "battleEnd";
    tick: number;
    winner: number;
};
export declare class EventSink {
    tick: number;
    events: SimEvent[];
    death(cellId: number, x: number, y: number, team: number): void;
    kill(killerTeam: number, victimTeam: number): void;
    explosion(x: number, y: number, team: number): void;
    fire(team: number): void;
    leadChange(team: number): void;
    end(winner: number): void;
}
