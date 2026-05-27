# Cellular Battle Royale — Engine v1

A code-rendered "1000 v 1000 v 1000 cells, each team has a special power, last team standing wins" battle simulator. Built as the prototype engine for a YouTube Shorts channel concept — the second-generation follow-up to a Harmoniq-style satisfying-sim format.

> **Status:** Browser prototype. Design is locked enough to start porting to a production renderer. Not yet wired to music.

---

## Table of contents

1. [Context](#context)
2. [Run it](#run-it)
3. [The 20 powers](#the-20-powers)
4. [How it works](#how-it-works)
5. [AI state machine](#ai-state-machine)
6. [Performance characteristics](#performance-characteristics)
7. [Tweakable parameters](#tweakable-parameters)
8. [Matchup signatures worth watching for](#matchup-signatures-worth-watching-for)
9. [Roadmap](#roadmap)
10. [Production pipeline notes](#production-pipeline-notes)
11. [Format strategy for YouTube Shorts](#format-strategy-for-youtube-shorts)
12. [Research context](#research-context)

---

## Context

The previous channel (Harmoniq) rode the bouncing-ball / shrinking-circle genre to ~1.34M subscribers with a music-sync hook (each bounce triggers a MIDI note of a recognizable song). That specific aesthetic is now heavily saturated — Kapwing's late-2025 audit found ~33% of fresh-account Shorts feeds were already brainrot-sim variants, with another ~21% being AI-generated lookalikes drafting on the same recommendation slots.

This engine targets the same psychological loops as Harmoniq (anticipation→release, catastrophic terminal state, recognition unlock, team rooting) but in a more crowded-but-less-saturated adjacent niche: **simulated battles with team powers**. Existing channels in this space (stick-figure Unity battles, "AI Battle" series) suffer from ugly art and unclear mechanics. The differentiation thesis here is **clean code-rendered visuals + legible power identities** — viewers can immediately see what each power does from the motion patterns alone.

Each match picks N powers at random from the roster of 20, assigns one to each team, and runs the simulation. With 20 powers choose N teams (no order):

| Teams | Distinct matchups |
|-------|-------------------|
| 2     | 190               |
| 3     | 1,140             |
| 4     | 4,845             |
| 5     | 15,504            |
| 6     | 38,760            |

Plus variable team sizes, spawn arrangements, and arena rules. Effectively infinite upload runway from one engine.

---

## Run it

Open `battle.html` in any modern browser. That's it. No build step, no dependencies.

Controls:
- **New battle** — re-roll the powers and reset all cells
- **Pause / Play** — freeze the simulation
- **Teams ± buttons** — change team count from 2 to 6 (auto-restarts)

Cell count auto-scales: 900 total cells divided across however many teams (so 6 teams = 150 cells each, 2 teams = 450 each).

---

## The 20 powers

Powers are grouped by archetype below. Damage / HP / speed values are multipliers applied on top of a 45 HP, 1.0× damage, 1.0× speed baseline.

### Pure aggression / DPS
- **Berserker** — 1.45× speed, 1.6× damage, always engages (no retreat or regroup)
- **Brute** — 2× damage, 1.15× radius, 0.9× speed, always engages
- **Glasshammer** — 3.3× damage, 0.42× HP, 1.3× speed, always engages. Nukes that die in one trade.

### Defensive / tanks
- **Tank** — 2.4× HP, 0.6× speed, 1.35× radius, 1.2× damage. Holds position (never retreats).
- **Goliath** — 3.5× HP, 2× damage, 2.4× radius, 0.48× speed. Hulking anchors.
- **Shielder** — 50% damage reduction, 0.85× speed
- **Reflector** — 55% of damage reflected back to attacker, 1.3× HP, 0.85× speed

### Sustain / healing
- **Vampire** — Heals 0.85 HP per hit dealt. Engages whenever wounded (combat is its heal source).
- **Regen** — Heals 0.18 HP per frame passively, 1.2× HP. Extremely hard to finish.
- **Lifebloom** — Aura heals nearby allies every 4 frames (0.35 HP, radius 32), 0.85× damage. Clustering is mandatory.

### Ranged & area-of-effect
- **Sniper** — Fires team-colored projectiles every 55 frames at targets within ~95 units (3.5 damage, projectile speed 4.2). Lower HP (0.8×).
- **Bomb** — Explodes on death, dealing 7 damage + knockback to all enemies within ~28 units. Always engages.

### Crowd control
- **Plague** — Hits infect enemies for 200 frames (~3.3s) of 0.07 HP/frame damage. DoT continues after disengaging.
- **Stunner** — Hits stun enemies for 26 frames (no AI, no movement). 1.05× speed.
- **Magnet** — Constant pull aura on all enemies within 60 units. 1.1× HP. Drags enemies into melee against their will.

### Mobility & burst
- **Swift** — 1.85× speed, 0.75× HP. Fastest baseline.
- **Charger** — Periodic dash (every 75 frames) at nearest target, 3.2× burst damage on impact. Always engages.
- **Frenzy** — Damage scales linearly from 1× at full HP to 2.6× at near-death. Terrifying when wounded.

### Multiplication & revival
- **Splitter** — 55% chance to spawn a clone of itself when it kills an enemy.
- **Necromancer** — Every 90 frames, scans for dead allies within 60 units and revives one at 50% HP. 0.9× HP.

---

## How it works

The simulation runs at ~60fps in browser. Each frame:

1. **Spatial hash rebuild** — every alive cell is bucketed into a 14×14 unit grid for O(1) neighbor queries.
2. **AI decision pass** — every cell, every 8 frames, scans a ~50-unit radius (7×7 grid cells) for allies and enemies, scores potential targets, picks a state and cached target.
3. **Per-cell update** — stun/plague ticks, regen, then movement forces based on AI state, then power-specific abilities (sniper fire, charger dash, necromancer revive, lifebloom aura).
4. **Magnet pass** — for each team with the Magnet power, apply constant pull force on enemies in range.
5. **Projectile pass** — move active projectiles, check collisions against cells of other teams via spatial hash.
6. **Cell-cell collision pass** — for each pair of overlapping cells, push apart and resolve damage if cross-team. Charger cells deal burst damage if currently dashing.
7. **Spawn pending cells** — newly-cloned (Splitter) or revived (Necromancer) cells added.
8. **Particle / corpse aging** — death particles fade out, corpses age out after 300 frames (5s).

### File layout

Right now everything lives in one HTML file because the prototype is small enough to keep all in one place:

```
battle.html       — single-file prototype (markup + CSS + JS)
README.md         — this file
```

For the production port (see [Production pipeline notes](#production-pipeline-notes)), the recommended split is:

```
sim/
  powers.py         — power data (the POWERS list)
  cells.py          — cell + collision logic
  ai.py             — state machine
  projectiles.py    — projectile + status effects
  arena.py          — boundaries, optional gravity wells, etc.
render/
  pygame_render.py  — offline frame rendering
audio/
  midi_sync.py      — note triggers from sim events
pipeline/
  batch_render.py   — (song, teams, powers, seed) → mp4
```

---

## AI state machine

Each cell runs a 4-state machine, refreshed every 8 frames during the AI decision pass:

| State | Trigger | Behavior |
|-------|---------|----------|
| `engage` | Enemy in perception range (default) | Move toward highest-scored target. Score = `3500 / (d² + 60) + (1 − hpFrac) × 5` — closeness plus wound bonus. |
| `retreat` | HP < 28% AND at least 1 ally in range | Move toward ally center of mass; also flee directly from threat. |
| `regroup` | Enemies outnumber allies locally by 2+ AND ≥1 ally in range | Move toward ally center of mass, regroup before re-engaging. |
| `hunt` | No enemies in perception range | Wander randomly until contact. |

### Power-aware overrides

- `aggro: true` (Berserker, Brute, Bomb, Charger, Glasshammer) — always `engage`, no retreat or regroup. Engage force is 50% stronger.
- `healer: true` (Vampire) — engages whenever HP < 95% and an enemy is in range (combat is its heal source).
- `hold: true` (Tank, Goliath) — never retreats or regroups.
- All other powers use default behavior.

### Flocking

A weak Boids-style alignment force matches each cell's velocity toward the average ally velocity in its perception range (weighted at 0.04 per frame). Doesn't apply when retreating. Creates emergent formation movement instead of independent swarming.

### Why not smarter?

Fully optimal AI would make the strongest power combo win every match — predictable matches kill the suspense, which is the whole point of the format. The current "smart enough to have tactics, dumb enough to make mistakes" zone is the sweet spot for entertainment. Going further requires the RL pivot (see Roadmap).

---

## Performance characteristics

At 900 total cells, 6 teams, full power roster:

| Subsystem | Ops/frame (approx) |
|-----------|---------------------|
| Spatial hash rebuild | 900 (single pass) |
| AI scans | ~10,000 (every 8 frames × 49 grid cells × 1.3 cells avg) |
| Cell-cell collision | ~10,000 (900 cells × 9 grid cells × ~1.3 candidates) |
| Magnet pull | ~5,000 if any team is Magnet |
| Projectile movement+collision | ~1,500 if any team is Sniper |
| Render (batched fills) | ~6 fill calls + particles |

Total well under 50K ops/frame in JS = comfortably 60fps on any modern device. The bottleneck if you scale up is the AI scan radius (currently 7×7 grid cells = 49); cutting to 5×5 halves the AI cost if you need to ship 2000+ cells.

---

## Tweakable parameters

All near the top of the script in `battle.html`:

```javascript
const W = 280, H = 498;         // canvas size (9:16 for Shorts)
const GRID_SIZE = 14;            // spatial hash cell size (≈2× cell radius)
let teamCount = 4;               // 2-6
// in init(): const perTeam = Math.round(900 / teamCount);
```

Per-cell baseline (in `newCell()`):
- Base HP: 45 (multiplied by `p.hp`)
- Base radius: 3 (multiplied by `p.radius`)

Combat:
- Base melee damage: 1.4 (in collision handler)
- Damping: 0.93 per frame
- Max velocity: 2.6 × `speedMult`
- AI scan radius: ~50 units (`SR2 = 2500`)
- Perception grid range: ±3 (7×7 grid cells)

---

## Matchup signatures worth watching for

These appear regularly enough to be worth clip-mining for thumbnails / titles:

- **Plague vs Tank** — Tank's HP advantage doesn't matter when victims rot from contact damage. Brutal mismatch.
- **Magnet vs Sniper** — Snipers get yanked into melee range and die helpless. Comedy.
- **Reflector vs Glasshammer** — Glasshammer's 3.3× damage gets 55% reflected for 1.8× return damage. Glasshammers one-shot themselves on contact. Visually striking.
- **Necromancer + Lifebloom + Regen** — three sustain teams in a 3-way create 5+ minute stalemates. Either avoid this combo in shipped videos or lean into it as "the unkillable battle".
- **Goliath in a 6-way** — 3.5× HP + 2× damage makes Goliath cells the natural last-survivors. Predictable enough that you should consider seeding the field against them for drama.
- **Charger vs Sniper** — Snipers fire from range but Chargers dash through projectiles to land 3.2× burst hits. Tight matchup that goes either way.
- **Bomb chain reactions** — when Bomb cells die clustered, explosions chain and can wipe a quarter of the map in two seconds.

---

## Roadmap

In rough order of recommended next builds:

### 1. Music sync layer
The actual Harmoniq move. Wire simulation events to MIDI notes:
- Each cell death → next note in the song's melody track
- Each projectile fire → drum hit
- Each major explosion → chord
- Battle pacing tied to song BPM (faster cells = faster songs)

This is the lowest-effort highest-impact next step. ~1 weekend's work.

Implementation sketch (Python, post-port):
```python
import mido
midi = mido.MidiFile('clair_de_lune.mid')
melody_notes = [m for m in midi if m.type == 'note_on' and m.velocity > 0]
note_index = 0

def on_cell_death(cell):
    global note_index
    if note_index < len(melody_notes):
        play_note(melody_notes[note_index])
        note_index += 1
```

### 2. Visual polish
- Glow / outline on dashing Chargers
- Plague clouds (green particle drift) on infected cells
- Muzzle flash on Sniper fire
- Damage shake on heavy hits
- Goliath impact tremor
- Death animation arc (currently just particles)

Each effect is small but the cumulative production-quality jump is large. ~1 week.

### 3. Arena modes
- **Shrinking ring** — battlefield contracts over time, forcing engagement
- **Gravity wells** — central or moving point pulls all cells
- **Capture-the-flag** — variant objective beyond elimination
- **Maze / obstacles** — fixed walls that channel combat
- **Day/night cycle** — visual variant where powers shift behavior

Each new mode is effectively a new content engine. ~1 week each.

### 4. Production renderer port
Move to Python (or Rust) for offline rendering at 1080×1920 60fps. See [Production pipeline notes](#production-pipeline-notes) below.

### 5. Tournament bracket UI / series format
- Pick 16 powers, single-elimination bracket
- Each match = one Short
- Series tells a story across uploads
- Title format: "Power X vs Power Y — Tournament round 1"
- Final round = blowout video, gets shared, drives backflow to earlier rounds

### 6. RL-trained agents (the moonshot)
Train each team's cells with reinforcement learning (PyTorch + Gymnasium env, or MuJoCo if you want continuous control). Export policy weights, run inference in the renderer. Content premise: "I trained 1000 cells for 10,000 generations to fight" — this is the genuine AI Warehouse pivot. Massive lift but the content moat is real and no copy-paste competitor can ship it.

---

## Production pipeline notes

The current browser prototype is for design iteration only. To run a real channel you need:

### Stack recommendation: Python

Plays to the existing simulation experience and keeps the dev loop fast.

```
pygame              — game loop, audio playback, sprite rendering
numpy               — vectorized physics (replaces JS typed arrays)
mido / pretty_midi  — MIDI parsing for music sync
FluidSynth          — render MIDI to audio
moviepy / ffmpeg    — final encode to MP4
```

Rust alternative: `bevy` (full ECS) or `macroquad` (immediate-mode, simpler). Better max performance, harder iteration.

### Offline rendering loop

```python
def render_video(seed, teams, powers, song_midi, output_path):
    sim = Simulation(seed=seed, teams=teams, powers=powers)
    audio = MidiPlayer(song_midi)
    
    with VideoWriter(output_path, 1080, 1920, 60) as vw:
        for frame_idx in range(60 * 30):  # 30s short
            events = sim.step()
            for ev in events:
                if ev.type == 'death':
                    audio.next_note()
            frame = render_frame(sim, 1080, 1920)
            vw.write(frame)
    
    encode_with_audio(output_path, audio.render())
```

### Batch pipeline

```python
configs = [
    {'seed': 42, 'teams': 3, 'powers': ['Berserker', 'Tank', 'Vampire'], 'song': 'clair_de_lune.mid'},
    {'seed': 43, 'teams': 4, 'powers': ['Sniper', 'Magnet', 'Splitter', 'Bomb'], 'song': 'fur_elise.mid'},
    # ... 50 more
]
for cfg in configs:
    render_video(**cfg, output_path=f'out/{cfg["seed"]}.mp4')
```

A weekend of rendering = months of upload runway.

### Upload automation

YouTube Data API v3 supports programmatic upload. Watch out for:
- Daily upload quota (10K units, ~50 videos)
- Title/description/tag templating (use Jinja2)
- Thumbnail generation (render a peak-action frame from each video)
- Schedule publishing across the day for algorithmic spread

### Music & copyright

Three viable strategies:

1. **Public-domain classical MIDI + FluidSynth render** — zero copyright risk, but no algorithmic boost from trending audio. Recommended for the first 50 uploads while you're tuning the format.
2. **Original arrangements of public-domain melodies** — RUSH-E-style virtuosic treatments of classical themes. Owned by you.
3. **Trending pop song MIDI with Content ID claim accepted** — best for algorithmic boost but revenue goes to rights-holder. Only use once you have downstream monetization (Patreon, app, sponsorship) since Shorts ad revenue is the trade-off.

---

## Format strategy for YouTube Shorts

### Cadence
2 Shorts/day for the first 90 days. Pre-render in batches. Algorithm signal-to-noise needs ≥100 uploads minimum before you can trust the data.

### Niche down first 100 uploads
Vary ONLY the song and the power combo. Keep team count, art style, UI overlay identical. The algorithm needs a coherent audience model — varying too many dimensions early dilutes the signal.

### Hook structure (first 1–2 seconds)
The proven pattern in this genre is `[flash forward to peak chaos for 150ms] → [hard cut to start state]`. Show the viewer what they're about to see, then give it to them. Without this hook, view-through rate drops below 50% and the algorithm stops serving the video.

### Title format
`[POWER A] vs [POWER B] vs [POWER C] — who wins?` is the workhorse. Variations:
- `I gave Red the most broken power...`
- `Splitter wasn't supposed to win this`
- `1000 Glasshammers vs 1000 Tanks`
- `Day [N] of [N] — every power gets a turn`

### Series hooks
"Day X of Y" is consistently the strongest series framing for this content type. Examples:
- `Day 1 of 100 — power tournament`
- `Day 23 — Sniper meets its match`

### Thumbnail / cover frame
Irrelevant for Shorts feed but matters on channel-page browse. Use a frame from peak visual saturation (mid-explosion, big dash impact).

### Realistic monetization expectations

For entertainment-class Shorts, RPM sits at **$0.01–$0.04 per 1,000 views** (vs. $0.15–$0.45 for finance/tech audiences — those viewers don't watch battle sims). At $0.03 RPM, you need 33M views to earn $1,000 in pure Shorts ad revenue.

Plan on secondary monetization being where the actual money is:
- **Paid simulator app** — let viewers build their own battles. Existing tools in this space charge $9-29/month.
- **Patreon for source code** — CodeCraftedPhysics model works.
- **Brilliant / edtech sponsorships** — AI Warehouse and similar channels all run these.
- **Long-form companion channel** — 10–20min "How I built this" videos at $1–$3 RPM (50–100× Shorts revenue per view).

---

## Research context

Quick summary of the landscape research that informed this build (full data in earlier conversation):

- **Harmoniq's genre is saturated.** Bouncing-ball Shorts (satisfying.ba11s, enjoyable.ba11s, CodeCraftedPhysics, FuncFlow) are at flat or negative growth on HypeAuditor. AI-generated lookalikes occupy ~21% of new-user Shorts feeds.
- **Battle sims are crowded but less saturated.** AI Warehouse (815K subs, ~5K/month growth) proves the demand for the format. Most existing channels use ugly Unity art with unclear mechanics — that's the opening for a code-rendered, clean-mechanic alternative.
- **Mid-2026 Shorts platform**: 200B daily views (announced by YouTube CEO June 2025), 45% creator revenue share after music licensing deductions.
- **Adjacent formats that didn't win this comparison**: Lenia (too meditative, no discrete events for music sync), particle life (similar aesthetic to Lenia, same issue), falling sand (interesting but no team rooting), wave function collapse (great one-offs, scales poorly).

The battle-sim format was selected over those because it preserves all four Harmoniq psychological hooks (anticipation→release, catastrophic terminal state, recognition unlock, team rooting) while moving to a less-saturated visual niche.

---

## License & ownership

This is your project. Use freely.

## Acknowledgments

- Format inspiration: Harmoniq, AI Warehouse, the broader "satisfying simulation" Shorts ecosystem
- AI design owes obvious debts to Boids (Reynolds 1986) and standard RTS unit AI patterns
