import { makeCell } from "../world";
export function handleDeath(w, sink, c, killer) {
    if (!c.alive)
        return;
    c.alive = false;
    sink.death(c.id, c.x, c.y, c.team);
    w.corpses.push({ x: c.x, y: c.y, team: c.team, age: 0 });
    if (w.corpses.length > 220)
        w.corpses.shift();
    const pC = w.teamPowers[c.team];
    if (killer && killer.alive) {
        sink.kill(killer.team, c.team);
        const pK = w.teamPowers[killer.team];
        if (pK.multiply && w.prng() < pK.multiply && w.cells.length + w.pending.length < 1500) {
            const n = makeCell(w, killer.team, killer.x + (w.prng() - 0.5) * 8, killer.y + (w.prng() - 0.5) * 8);
            n.vx = (w.prng() - 0.5) * 1.6;
            n.vy = (w.prng() - 0.5) * 1.6;
            w.pending.push(n);
        }
    }
    if (pC.explode)
        explode(w, sink, c.x, c.y, c.team);
}
export function explode(w, sink, x, y, killerTeam) {
    sink.explosion(x, y, killerTeam);
    for (const o of w.cells) {
        if (!o.alive || o.team === killerTeam)
            continue;
        const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
        if (d2 < 800) {
            const d = Math.sqrt(d2 + 0.01);
            o.hp -= 7;
            o.vx += (dx / d) * 1.6;
            o.vy += (dy / d) * 1.6;
            if (o.hp <= 0 && o.alive)
                handleDeath(w, sink, o, null);
        }
    }
}
export function applyDamage(w, sink, attacker, target, base) {
    if (!target.alive)
        return;
    const pA = attacker ? w.teamPowers[attacker.team] : null;
    const pT = w.teamPowers[target.team];
    let dmg = base * (pA?.damage ?? 1);
    if (pA?.frenzy && attacker)
        dmg *= 1 + (1 - attacker.hp / attacker.maxHp) * 1.6;
    if (pT.dmgReduce)
        dmg *= 1 - pT.dmgReduce;
    target.hp -= dmg;
    if (pT.reflect && attacker && attacker.alive) {
        attacker.hp -= dmg * pT.reflect;
        if (attacker.hp <= 0)
            handleDeath(w, sink, attacker, target);
    }
    if (pA?.heal && attacker && attacker.alive)
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + pA.heal);
    if (pA?.infect)
        target.plagueT = Math.max(target.plagueT, pA.infect);
    if (pA?.stun)
        target.stunT = Math.max(target.stunT, pA.stun);
    if (target.hp <= 0)
        handleDeath(w, sink, target, attacker);
}
