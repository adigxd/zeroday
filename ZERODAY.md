# ZERODAY — Game Design & Implementation Plan

> A top-down 2D arena brawler in the spirit of starve.io's aesthetic and Soul Knight's pace.
> Grid-based, weapon-drop-driven, single-player-first with multiplayer on the roadmap.

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Screen Flow](#2-screen-flow)
3. [UI Screens](#3-ui-screens)
4. [Gameplay Systems](#4-gameplay-systems)
5. [Weapons & Items](#5-weapons--items)
6. [AI Opponents](#6-ai-opponents)
7. [Maps](#7-maps)
8. [Art Direction & Sprites](#8-art-direction--sprites)
9. [Audio Design](#9-audio-design)
10. [Tech Stack & Recommendations](#10-tech-stack--recommendations)
11. [Project Structure](#11-project-structure)
12. [Implementation Phases](#12-implementation-phases)
13. [Open Questions](#13-open-questions)

---

## 1. Game Overview

**Genre:** Top-down 2D arena brawler / .io-style  
**Players:** Singleplayer (1 human vs 1–3 AI); multiplayer planned for a later phase  
**Win condition:** Last player/AI standing per round  
**Core loop:** Break crates → grab weapons → hunt enemies → survive → endless rounds until quit

The feel should be fast and punchy — Soul Knight's kinetic energy in a starve.io body. Block-breaking creates tension and reward; weapon drops create risk-versus-reward decision making; the CPS cap on block-breaking keeps the skill ceiling physical and engaging.

Points are tracked at the top of the screen for the human player and each AI, persisting across rounds within a session. Each round selects a new random map.

---

## 2. Screen Flow

```
[Menu Screen]
     │
     ├──→ [Play] → [Game Screen] ──→ [Round End Popup] ──→ next round [Game Screen]
     │                                                └──→ [Quit to Menu]
     ├──→ [Settings Screen] → back to [Menu]
     └──→ [Stats Screen] → back to [Menu]

During Game:
     [ESC] → [Pause Screen] → Resume → [Game Screen]
                            → Quit   → [Menu Screen]
```

---

## 3. UI Screens

### 3.1 Menu Screen

- Game logo / title centered
- **Play** button — launches game with current player count
- **Player count field** — displays `2`, `3`, or `4` with up/down arrow buttons (range: 2–4); total combatants (1 human + 1–3 AI)
- **Settings** button → Settings Screen
- **Stats** button → Stats Screen
- Background: subtle animated tile grid or looping map preview

### 3.2 Settings Screen

- **Theme** — toggle button showing ☀ (light) or ☽ (dark); clicking switches theme and immediately restarts the settings scene. All UI scenes (Menu, Settings, Stats, Pause) read the stored theme on create.
- **AI Difficulty** — ◀/▶ cycle toggle: Easy / Medium / Hard (affects AI block-breaking CPS and behavior; see §6.2)
- **Attack** — ◀/▶ cycle toggle: Held (hold key to auto-fire at weapon cooldown rate) / Tap (one press = one shot). Default: Held.
- **Movement** — ◀/▶ cycle toggle: Held (hold key = continuous movement at move-cooldown rate, default) / Tap (one keypress = one tile).
- **Hotkey Bindings** — 7 rebindable actions, displayed as a list:
  | Action    | Default      |
  |-----------|--------------|
  | Move Up   | `W`          |
  | Move Down | `S`          |
  | Move Left | `A`          |
  | Move Right| `D`          |
  | Break 1   | `Q`          |
  | Break 2   | `E`          |
  | Attack    | `Space`      |
- **RESET** button beside the KEY BINDINGS header restores all bindings to defaults
- Clicking a binding enters a "listening" state; next key/button press sets the binding; assigning a key already in use clears the previous action
- `ESC` is always reserved for Pause — not rebindable, shown greyed-out at the bottom of the bindings list
- Back button returns to Menu (bindings auto-saved on each change)

### 3.3 Pause Screen (singleplayer only)

- Triggered by `ESC` during a live game
- Darkens/blurs the game screen behind it
- Two options: **Resume** and **Quit to Menu**
- No settings access from pause (keep it simple)

### 3.4 Game Screen

- Full-screen grid-based arena
- **Score bar** at top of screen: shows the character art and current round points for each combatant (human + all AIs), persists across rounds
- Pre-game **3 → 2 → 1 → GO!** countdown popup (input locked during countdown)
- HUD:
  - Health bars appear **above each character** when they've taken damage and persist until death
  - Player indicator (e.g. subtle white glow or name tag on the human player)
  - Current weapon icon shown in a corner HUD slot (small, unobtrusive)
- On player death: brief flash / death animation, player is removed from grid
- Round ends when one or zero entities remain → brief **round-end popup** (who won or DRAW if all died simultaneously, top damage dealer) → press Attack to start next round on a new random map, or ESC to quit to menu
- **Player death mid-round:** AIs keep fighting. A **Skip Round** button appears at the bottom of the screen. Clicking Skip awards a point to a **randomly chosen alive AI** (simulating a winner), then ends the round. If the player watches and an AI wins normally, the AI earns the point as usual.

### 3.5 Round End Popup

- Shown inline over the game after each round (not a separate screen)
- Displays: who won the round (or **DRAW** if all remaining players died simultaneously), who dealt the most damage that round
- **Next Round:** press the Attack hotkey (default `Space`)
- **Quit to Menu:** press `ESC`
- Round points: 1 point awarded to the last survivor; **no point awarded on a draw**

### 3.6 Stats Screen

Persistent lifetime stats tracked in localStorage:

| Stat            | Description                          |
|-----------------|--------------------------------------|
| Blocks Broken   | Total blocks destroyed across all games |
| Shots Fired     | Total projectile attacks fired       |
| Kills           | Total enemy kills                    |
| Deaths          | Total times the human player died    |
| Item Pickups    | Total weapons/items picked up        |

---

## 4. Gameplay Systems

### 4.1 Grid & Movement

- Arena is a 2D tile grid (size depends on map and player count)
- Each tile is either: **floor**, **solid wall**, **breakable block**, or **crate**
- Players occupy exactly one tile at a time; no stopping mid-tile
- Movement is **tile-to-tile**: pressing a direction instantly commits to moving to the adjacent tile center; tween the visual position smoothly between tiles
- Movement speed: **player — one tile per 63ms (~16 tiles/sec)**; **AI — Easy: 250ms, Medium: 187ms, Hard: 125ms (~8 tiles/sec, half player speed)**
- A player **cannot move into a tile occupied by another player or a wall/block**
- Movement uses the 4 directional hotkeys; **diagonal movement is not supported**
- The player's **facing direction** = the direction of their last movement input; this determines attack direction for all weapons

### 4.2 Block Breaking

- Players break blocks using `Break 1` and/or `Break 2` **regardless of currently held weapon**
  - Either key can be held alone to break continuously at the CPS cap
  - Alternating between `Break 1` and `Break 2` also works for players who prefer that rhythm
  - **CPS cap: 18 hits/sec** (minimum 55ms between hits)
  - The player must be **adjacent and facing** the block to break it
  - **No weapon attack (melee or ranged) can damage or break blocks** — only the break keys
- Blocks have HP values:
  - Standard breakable block: 3 hits
  - Crate: 2 hits (easier, reward is worth it)
- Visual feedback: block shows crack progression per hit stage
- A small "swing" animation plays on the character when they hit
- **Broken tiles do not respawn** — the map degrades permanently across rounds within a session (maps reset between sessions on new Play)

### 4.3 Combat

- **Facing direction** = last movement direction; all attacks fire/swing in this direction
- **Melee weapons:** hit the tile directly in front of the player (and diagonal tiles for Sword/Mace — see §5.1)
- **Gun weapons (Pistol, Rifle, Sniper):**
  - Bullet is **instant** — no travel time; damage resolves the moment Attack is pressed
  - Leaves a thin colored line from shooter to target (or max range) that fades out just before the next shot's cooldown ends (duration = weapon cooldown - small margin)
  - Line color is weapon-specific (see §5.2)
  - Blocked by walls and breakable blocks (does not pass through)
- **Laser Gun:**
  - Instant, infinite range
  - Travels tile by tile; stops at the **tile center just before** any obstacle (wall/block/crate/border)
  - Bounce direction (left or right relative to travel) is randomly decided at fire time
  - Bounces exactly **once** at a 90° angle, then travels until it hits a second obstacle
  - **Passes through players** (hits all entities in its path, both before and after bounce)
  - Does not pass through blocks/crates; stops on obstacle
  - Cannot fire if an obstacle is directly in front
- **Bow:**
  - Arrow has **actual travel time** — moves tile by tile at 8 tiles/sec
  - Blocked by walls and blocks
  - Does not pass through players — stops on first player hit
- **RPG:**
  - Rocket has travel time at **4 tiles/sec**, max range **6 tiles**
  - Deals **100 damage** on direct hit (one-shots most enemies)
  - On impact (obstacle, entity, or range expiry): explodes, breaking all **8 surrounding blocks/crates** and dealing **50 AoE damage** to any entity in those tiles (including the impact tile itself)
  - **Friendly fire:** AoE can hit the shooter
  - Cannot fire if an obstacle is directly in front
- **All ranged weapons** are blocked if an object (wall/block/crate) is directly in front — floor tiles and holes do not block
- Players cannot deal damage to themselves (except RPG AoE)
- Picking up a new weapon immediately **resets the attack cooldown** to 0
- **Attack** hotkey triggers current weapon

### 4.4 Health System

- Each player starts with **100 HP** per round
- Health bar appears above the character **after first damage taken** and persists
- Health bar color: green → yellow → red as HP decreases
- No natural regeneration (medkits are the only healing source)
- Death: HP reaches 0 → player/AI is removed from the grid
- Player death in singleplayer does not end the session — the remaining AIs continue until one survives; the human's death counts as a loss for that round

### 4.5 Weapon Pickup

- Weapons and items spawn when a **crate** is destroyed (weighted drop table)
- A weapon/item icon appears on the floor tile
- Walking onto the tile **auto-picks it up** immediately
- **No inventory:** new weapon always replaces current weapon; old weapon is lost (does not drop)
- Instant-use items (medkits, shield) trigger immediately on pickup
- Drop tables can include a "nothing" outcome

---

## 5. Weapons & Items

### 5.1 Melee Weapons

| Weapon  | Range  | Damage | Swing Speed | Notes                                                                 |
|---------|--------|--------|-------------|-----------------------------------------------------------------------|
| Knife   | 1 tile | 15     | Fast        | Default spawn weapon; hits only the tile directly in front            |
| Mace    | 1 tile | 30     | Slow        | Hits tile in front + both diagonals at **half damage** (15); breaks blocks faster |
| Sword   | 1 tile | 22     | Medium      | Hits tile in front + both diagonals at **half damage** (11)           |

Diagonal hits for Sword and Mace: if facing Up, diagonals are Up-Left and Up-Right (and so on for other directions). Diagonals cannot be moved to or attacked otherwise.

### 5.2 Ranged Weapons

| Weapon     | Damage   | Fire Rate  | Visual Line Color  | Notes                                                                 |
|------------|----------|------------|--------------------|-----------------------------------------------------------------------|
| Pistol     | 25       | Medium     | Yellow-white       | 8-tile max range; blocked by walls/blocks                             |
| Rifle      | 20       | Fast       | Cyan               | 14-tile max range; blocked by walls/blocks; does NOT break blocks     |
| Sniper     | 70       | Very Slow  | Bright white       | Full-map range; blocked by walls/blocks; one-shot punish              |
| Laser Gun  | 35       | Slow       | Green              | Full-map, instant, passes through players, bounces 1 wall; see §4.3  |
| Bow        | 30       | Medium     | N/A (arrow sprite) | Arrow travels 8 tiles/sec; blocked by walls/blocks; stops on first player hit |
| RPG        | 100 (50 AoE) | Very Slow | N/A (rocket sprite)| 4 tiles/sec, 6-tile range, explodes on impact — see §4.3          |

**Gun visual effect:** a thin line rendered from shooter to impact point, fading to nothing over a duration of `(weapon cooldown × 0.85)` seconds. Line color per weapon as above.

### 5.3 Instant-Use Items

| Item     | Effect                    |
|----------|---------------------------|
| Medkit   | Restore 40 HP (cap at 100)|
| Shield   | Absorbs up to 30 damage; displayed as a **fading stroke-only bubble** around the entity — alpha decreases proportionally as shield HP is consumed; picking up a second one refreshes to 30 |

### 5.4 Drop Table

Every crate break has a **50% chance to drop nothing** (pre-roll). If the pre-roll passes, one item is selected with **equal probability** from the table below:

| Outcome    | Weight |
|------------|--------|
| Pistol     | 1      |
| Rifle      | 1      |
| Sniper     | 1      |
| Laser Gun  | 1      |
| Bow        | 1      |
| RPG        | 1      |
| Mace       | 1      |
| Sword      | 1      |
| Medkit     | 1      |
| Shield     | 1      |

Effective drop rate per crate: 50% nothing, ~5% per item (each of the 10 items equally likely).

---

## 6. AI Opponents

### 6.1 Behavior States

The AI operates on a 6-state machine (`src/ai/AIStateMachine.ts`):

```
[Wander]      → target exists (always — no range cap)      → [Chase]
[Wander]      → random crate-seek roll passes              → [SeekCrate]
[Wander]      → floor item nearby (weapon/medkit)          → [SeekItem]
[Chase]       → adjacent to target (dist=1)                → [Attack]
[Chase/Wander]→ HP ≤ flee threshold                       → [Flee]
[Chase/Wander]→ HP < 80 + medkit in range                 → [SeekItem] (medkit priority)
[Chase]       → knife + dist > 5 + crate in radius        → [SeekCrate] (no timer gate)
[SeekCrate]   → enemy within 3 tiles                      → [Chase] (abandon crate)
[SeekCrate]   → adjacent to crate                         → break crate, then re-evaluate
[SeekItem]    → reaches item tile                         → pickup auto-triggers; re-evaluate
[Attack]      → target moves away (dist > 1, melee)        → [Chase]
[Flee]        → floor medkit in range (6 tiles)            → pathfind to medkit instead of fleeing
[Any]         → same row/col + ranged weapon + in range    → fire (opportunistic, overrides state)
```

**Target selection:** AI targets the **nearest alive entity** by Manhattan distance — not specifically the human player. AIs fight each other.

**BFS pathfinding:** recalculated each move decision on the current grid state. Pathable tiles: T_FLOOR only. T_BLOCK, T_CRATE, T_SOLID are impassable (T_HOLE exists as a tile type but is currently unused in generated maps).

**State evaluation timer:** state changes (except flee/attack/adjacent/medkit-priority) are gated by a 800–1600ms timer to prevent per-frame thrashing.

**Wander behavior:** picks a random direction every 400–1100ms. If the chosen direction is immediately blocked by a T_BLOCK or T_CRATE, the AI breaks that tile (if the block cooldown permits) rather than picking a new direction. If the tile is T_SOLID or another impassable non-breakable, a new random direction is chosen immediately.

**Floor item targeting (`SeekItem`):** AI reads the live `__floorItems` map from the scene. Target is re-validated each tick — if the item was picked up by another entity, AI returns to wander. Medkit targeting is checked every frame when HP < 80 (bypasses state timer). Weapon targeting uses a per-evaluation probability roll.

### 6.2 Difficulty Scaling

Difficulty is set in Settings and applies uniformly to all AIs in the session.

| Parameter                          | Easy        | Medium      | Hard        |
|------------------------------------|-------------|-------------|-------------|
| Block-breaking CPS                 | 4           | 9           | 16          |
| Move speed (ms per tile)           | 250ms       | 187ms       | 150ms       |
| Move hesitation (per step)         | 35%         | 12%         | 0%          |
| Flee HP threshold                  | 12          | 18          | Never       |
| Chase range (tiles, Manhattan)     | Unlimited   | Unlimited   | Unlimited   |
| Crate-seek probability             | 35%         | 55%         | 75%         |
| Crate-seek search radius           | 4 tiles     | 8 tiles     | 12 tiles    |
| Crate-seek state duration          | 2000–4000ms | 2000–4000ms | 2000–4000ms |
| Medkit seek radius (HP < 80)       | 5 tiles     | 9 tiles     | 14 tiles    |
| Weapon seek radius                 | 4 tiles     | 7 tiles     | 12 tiles    |
| Weapon seek probability            | 45%         | 65%         | 85%         |
| Chase dist to interrupt item-seek  | 3 tiles     | 6 tiles     | 6 tiles     |
| Chase diversion chance (per timer) | 45%         | 28%         | 12%         |
| Chase diversion item radius        | 5 tiles     | 6 tiles     | 5 tiles     |
| Chase diversion crate radius       | 4 tiles     | 5 tiles     | 4 tiles     |
| Chase diversion state duration     | 1000–1800ms | 1000–1800ms | 1000–2000ms |
| Opportunistic crate distraction    | 18% / r=2   | 42% / r=3   | 72% / r=3   |
| Bullet dodge chance (per tick)     | 22%         | 52%         | 82%         |
| Bullet dodge threat radius         | 5 tiles     | 5 tiles     | 5 tiles     |
| Crate chance multiplier (knife)    | ×1.6        | ×1.6        | ×1.6        |
| Crate chance (weapon, out-of-range)| —           | —           | —           |
| Diversion chance multiplier (knife)| ×1.8        | ×1.8        | ×1.8        |
| Diversion chance (weapon, flat)    | 22%         | 22%         | 22%         |
| Knife crate-seek radius (no timer) | 5 tiles     | 8 tiles     | 10 tiles    |
| Crate interrupt enemy distance     | 3 tiles     | 3 tiles     | 3 tiles     |
| Flee medkit scan radius            | 6 tiles     | 6 tiles     | 6 tiles     |

**Global awareness:** AI is always aware of every entity's position — there is no chase range cap. The moment a target exists, the AI will pursue it (subject to crate/item diversions and the state timer). This eliminates the "shuffling forever" failure mode on large maps.

**Knife holder crate priority:** when holding a knife and the enemy is more than 5 tiles away, the AI always commits to any nearby crate (within knife crate-seek radius) *without* waiting for the state timer. This runs every evaluation tick, making knife-wielding AIs strongly prefer upgrading their weapon over chasing. The timer gate only kicks in once no crate is found nearby.

**Crate-breaking interrupt:** if an enemy closes to within 3 tiles while the AI is in `seek_crate`, it immediately abandons the crate and switches to `chase`. This threshold is the same across all difficulties — movement and breaking speed already differentiate difficulty.

**Breakable tile validation:** `seek_crate` accepts both T_CRATE and T_BLOCK as valid targets (both are breakable). If the targeted tile is gone or was never breakable, the AI re-searches within 12 tiles; if nothing is found, it returns to `wander`.

**Opportunistic crate distraction:** during `chase` and `wander` states, if a crate is within radius (Easy: 2 tiles, Medium/Hard: 3 tiles) and the state timer has cooled, the AI rolls a per-difficulty chance to fully commit to breaking that crate — entering `seek_crate` state and pathfinding to it. Easy 18%, Medium 42%, Hard 72%. Not active during `attack`, `flee`, `seek_crate`, or `seek_item`.

**Chase diversion:** even while actively chasing, when the state timer expires and the enemy is more than 3 tiles away, the AI rolls a diversion chance. Knife holders use a per-difficulty base (Easy 45%, Medium 28%, Hard 12%) scaled up ×1.8 — they badly need a weapon upgrade. Weapon holders use a flat 22% across all difficulties — they always retain some interest in crates regardless of what they're carrying. On success the AI checks for a nearby floor weapon then a nearby crate; if found, breaks off the chase. The diversion runs for 1–2 seconds before re-evaluating.

**Floor item (SeekItem) evaluation:** medkit priority is checked every frame when HP < 80 and bypasses the state timer. Weapon seeking is checked on state-timer expiry. The AI validates the target each tick and falls back to wander if the item disappears.

**Flee behavior:** if a floor medkit exists within 6 tiles, the AI pathfinds to it instead of running away. Otherwise it moves opposite the target; if blocked, tries a random direction. Adjacent crates are broken while fleeing as a secondary medkit source.

**Chase behavior:** all weapons use the same BFS-to-target chase. If BFS fails (path fully blocked), the AI checks the tile in the rough direction of the target — if it's T_BLOCK or T_CRATE it breaks it; otherwise it falls back to wander. Melee weapons attack when adjacent (dist=1). Ranged weapons rely entirely on opportunistic fire to shoot when the opportunity arises.

**Opportunistic ranged fire:** checked every update frame regardless of state — if the AI has a ranged weapon, the target is on the same row or column, within weapon range, *and* has a clear line of sight (no T_BLOCK/T_CRATE/T_SOLID between them), the AI faces the target and fires. If the LOS is blocked by a breakable tile while on the same axis and in range, the AI breaks the blocking tile to clear the lane.

**Bullet dodging:** each update tick the AI checks all live projectiles (arrows, RPG rockets) not fired by itself. If a projectile is in the same row or column and within 5 tiles and heading toward the AI, the AI attempts to step perpendicular (randomly chooses up/down or left/right first). The dodge fires before the state machine so it takes priority. Dodge success is gated by a per-difficulty probability roll: Easy 22%, Medium 52%, Hard 82%.

**Position/attack sync:** entities do not fire while a movement tween is in progress (`isMoving() === true`). This ensures logical tile position (col/row) matches the visual body position before any attack is resolved. The health bar is rendered at the visual body position (`body.x/y`) rather than the logical tile center, so it tracks smoothly through movement tweens.


---

## 7. Maps

### 7.1 Map Structure

- Grid of tiles with a defined width × height
- Tile types:
  - `T_FLOOR` (0) — passable
  - `T_HOLE` (1) — impassable to entities, projectiles fly over
  - `T_BLOCK` (2) — breakable (3 hits)
  - `T_CRATE` (3) — breakable (2 hits), drops item on break
  - `T_SOLID` (4) — indestructible, blocks entities and projectiles
- Player spawn points at the four corners (1 tile in from border)
- **Map is procedurally generated fresh at the start of each round**
- Broken tiles persist for the life of the session; new game = new map

### 7.2 Procedural Generation

All maps are **4-fold symmetric** — every tile placement is mirrored to all four quadrants via `sym(r, c, tile)`.

Generation steps (per round):
1. Fill interior with T_FLOOR; border = T_SOLID (indestructible walls)
2. Place a 2×2 T_SOLID pillar at the exact center
3. Place 1–2 random T_SOLID clusters in the quadrant interior (L-shape or 2×2), mirrored ×4
4. Scatter 3–6 T_BLOCK (breakable) per quadrant (×4 via symmetry)
5. Scatter 2–4 T_CRATE per quadrant (×4 via symmetry); if random placement fills 0 or 1 crates (can happen on crowded small maps), a fallback scan forces at least 2 crate placements
6. Clear a 3×3 area around each spawn corner to guarantee accessible starts
7. **Connectivity check** (`spawnsConnected`): BFS flood-fill T_FLOOR from spawn[0] and verify every other spawn is reachable. If any spawn is isolated, the entire map is discarded and regenerated (up to 50 attempts). This preserves 4-fold symmetry — no tiles are carved asymmetrically.

### 7.3 Map Sizes

Maps are randomly sized each round with **50% chance square, 50% chance rectangle**. Size pool depends on player count (even numbers only):

| Player Count | Size Pool       |
|--------------|-----------------|
| 2            | 10–18 (step 2)  |
| 3            | 14–22 (step 2)  |
| 4            | 16–24 (step 2)  |

Rectangle maps constrain the W:H ratio to ≤ 1.8:1.

**Tile size scaling:** `TILE_SIZE = min(floor(CANVAS_W / W), floor(gameAreaH / H))`. Smaller maps get larger tiles, filling the screen proportionally. Maps are centered horizontally and vertically within the game area (offsets tracked as `TILE_OFFSET_X` and `mapTopY` in GameScene).

---

## 8. Art Direction & Sprites

### 8.1 Visual Style

- **Perspective:** top-down 2D, no isometric tilt
- **Not pixel art** — proper sprites with smooth edges; think simple vector-ish or hand-drawn digital art
- **Palette:** dark, desaturated background tiles with punchy, saturated character colors
- Characters are a **rounded rectangle body** with **2 beady eyes** and **2 circle hands**

### 8.2 Character Sprites & Animations

Characters are supplied as PNG sprite sheets by the artist (you). Claude will implement the animation logic.

**Character design:**
- Rounded rectangle body
- 2 small beady eyes on the face side (the side facing the movement direction)
- 2 circle "hands" that subtly bob up and down during idle and walking (slight offset depending on held weapon)
- Hands shift to a different position/pose based on the currently held weapon (e.g. both hands forward for gun, one hand raised for sword)

**Animations (implemented in-engine via tweens/frame switching):**
- **Idle:** hands bob gently (small sin-wave vertical oscillation, ~1 Hz)
- **Walk:** hands bob slightly faster
- **Attack/swing:** hands move toward the attack direction briefly, snap back
- **Hit flash:** character briefly flashes white (tint overlay, no separate sprite needed)
- **Death:** character shrinks and fades out

**Color differentiation (recolored versions of the same base sprite):**
- Human player: white / light grey
- AI 1: red
- AI 2: blue
- AI 3: yellow / gold

### 8.3 Sprite File Format & Organization

- **File type: PNG** with transparent backgrounds
- **Recommended canvas size per character sprite:** 64×64 px (at 1× scale; scale up in-engine as needed)
- **Naming convention:** `character_white.png`, `character_red.png`, etc. (one file per color variant, or a single base + tint applied in code)
- Tiles: **32×32 px PNG** per tile variant (floor_1, floor_2, wall, block_0, block_1, block_2, crate)
- Weapons on floor: **24×24 px PNG** per weapon icon
- All sprites go in `public/assets/sprites/` organized by category:

```
public/assets/sprites/
├── characters/
│   ├── character_white.png     ← human player (64×64 px)
│   ├── character_red.png
│   ├── character_blue.png
│   └── character_yellow.png
├── tiles/
│   ├── floor_1.png             ← 32×32 px floor variants
│   ├── floor_2.png
│   ├── block_0.png             ← undamaged breakable block
│   ├── block_1.png             ← 1 hit taken
│   ├── block_2.png             ← 2 hits taken
│   └── crate.png
├── weapons/
│   ├── floor/                  ← item lying on the ground after drop (24×24 px)
│   │   ├── knife.png
│   │   ├── mace.png
│   │   ├── sword.png
│   │   ├── pistol.png
│   │   ├── rifle.png
│   │   ├── sniper.png
│   │   ├── laser_gun.png
│   │   ├── bow.png
│   │   └── rpg.png
│   └── held/                   ← rendered on character hands (24–32 px, drawn pointing RIGHT, origin at grip)
│       ├── knife.png
│       ├── mace.png
│       ├── sword.png
│       ├── pistol.png
│       ├── rifle.png
│       ├── sniper.png
│       ├── laser_gun.png
│       ├── bow.png
│       └── rpg.png
├── items/
│   ├── medkit.png              ← 24×24 px
│   └── shield.png
└── ui/
    └── (health bar frames, score icons, etc.)
```

**Floor sprites** (`weapons/floor/`, `items/`) are rendered flat on the tile where the item was dropped, centered on the tile. Any orientation works since they don't rotate.

**Held sprites** (`weapons/held/`) are positioned between/on the character's hands and rotate to match the character's facing direction. Draw them pointing **right** with the grip at the left edge — the code handles rotation. Origin should be set to the grip point so rotation looks natural.

Until your sprites are ready, Claude will use **colored rectangles and circles** as placeholder graphics so all game logic can be built and tested immediately.

### 8.4 Projectile & Effect Rendering (in-engine, no sprites needed)

- **Gun shot line:** thin line from shooter to impact, weapon-color, fades to transparent over `cooldown × 0.85s`
- **Bow arrow:** small rotated rectangle traveling tile-by-tile
- **Laser:** bright thin line, flashes in instantly, fades similarly to gun line
- **Hit sparks:** 3–4 small colored dots flying outward (Phaser particles)
- **Block break:** 3–5 small tile-colored debris chunks (Phaser particles)
- **Pickup float text:** brief "+WeaponName" text floats up and fades

### 8.5 UI Art

- Font: Google Font "Press Start 2P" (loaded from CDN) or plain sans-serif fallback
- Health bar: flat colored bar with dark border, color changes green → yellow → red
- Score bar at top: character portrait + point count per combatant
- Countdown numbers: large, bold, screen-centered, quick scale-in animation

---

## 9. Audio Design

### 9.1 Music

- Menu: laid-back chiptune / lo-fi loop
- In-game: uptempo chiptune with driving beat
- Results: short fanfare (win) or downbeat sting (lose)
- All tracks seamlessly loopable

### 9.2 Sound Effects

| Event              | Sound Character                                    |
|--------------------|----------------------------------------------------|
| Block hit          | Dull thud / chip, slight pitch variation           |
| Block break        | Crunch + debris scatter                            |
| Crate break        | Wooden crack, slightly louder                      |
| Item pickup        | Bright ascending chime                             |
| Knife swing        | Woosh                                              |
| Mace swing         | Heavy whomp                                        |
| Pistol shot        | Sharp pop                                          |
| Rifle shot         | Fast crack                                         |
| Sniper shot        | Loud boom with slight reverb                       |
| Laser fire         | Sci-fi zap / buzz                                  |
| Bow fire           | Soft twang                                         |
| Player hit         | Short grunt / impact                               |
| Player death       | Descending tone / thud                             |
| Medkit use         | Soft healing chime                                 |
| Countdown beep     | Clean tick (low on 3/2/1, high on GO!)             |

---

## 10. Tech Stack & Recommendations

### 10.1 Stack

| Tool | Purpose |
|------|---------|
| **Phaser 3** | Game framework — tilemap, input, scene system, tweens, particles |
| **TypeScript** | Type safety; Phaser 3 has full TS types |
| **Vite** | Fast dev server + bundler |
| **LocalStorage** | Persist settings and lifetime stats (no backend needed yet) |

### 10.2 Multiplayer Path (future)

- Node.js + WebSocket server (`ws` or `Socket.io`)
- Server authoritative for game state; clients send inputs, receive state updates
- Menu player count field transitions to a lobby system

---

## 11. Project Structure

```
zeroday/
├── public/
│   └── assets/
│       ├── sprites/        # See §8.3 for full layout
│       ├── tilemaps/       # JSON map files
│       └── audio/          # Music + SFX
├── src/
│   ├── main.ts
│   ├── config/
│   │   ├── GameConfig.ts
│   │   └── DefaultBindings.ts
│   ├── scenes/
│   │   ├── MenuScene.ts
│   │   ├── SettingsScene.ts
│   │   ├── GameScene.ts
│   │   ├── PauseScene.ts
│   │   ├── RoundEndScene.ts
│   │   └── StatsScene.ts
│   ├── entities/
│   │   ├── Entity.ts        # Base class
│   │   ├── Player.ts
│   │   └── AIPlayer.ts
│   ├── weapons/
│   │   ├── Weapon.ts        # Base class
│   │   ├── Knife.ts
│   │   ├── Mace.ts
│   │   ├── Sword.ts
│   │   ├── Pistol.ts
│   │   ├── Rifle.ts
│   │   ├── Sniper.ts
│   │   ├── LaserGun.ts
│   │   └── Bow.ts
│   ├── systems/
│   │   ├── InputManager.ts
│   │   ├── CombatSystem.ts
│   │   ├── DropSystem.ts
│   │   ├── MapManager.ts
│   │   ├── ScoreManager.ts
│   │   └── StatsTracker.ts
│   ├── ai/
│   │   └── AIStateMachine.ts
│   └── ui/
│       ├── HealthBar.ts
│       ├── ScoreBar.ts
│       └── Countdown.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 12. Implementation Phases

### Phase 1 — Foundation
- Vite + Phaser 3 + TypeScript scaffold
- Menu screen with player count selector
- Game scene with tilemap rendering (placeholder colored rectangles)
- Player movement (tile-based, 0.25s per tile, tween smoothing, facing direction tracking)
- Block breaking (break keys, CPS cap, crack stages)
- Score bar (top of screen, persists across rounds)

### Phase 2 — Combat & Weapons
- Knife melee (adjacency damage, facing direction)
- Sword + Mace (diagonal hit at half damage)
- Pistol, Rifle, Sniper (instant, colored line effect)
- Laser Gun (instant, wall bounce, passes through players)
- Bow (arrow travel time, tile-by-tile)
- Health system + health bar HUD
- Crate destruction + drop table + weapon auto-pickup
- Instant items (medkit, shield)

### Phase 3 — AI & Game Loop
- AI state machine (wander, chase, attack, flee, break crates)
- Difficulty tiers (Easy/Medium/Hard CPS + behavior tweaks)
- 3-2-1-GO countdown
- Death handling, round-end popup, next round / quit flow
- Session-scoped round damage tracking

### Phase 4 — Polish & Persistence
- Settings screen (volume, difficulty, hotkey rebinding)
- Stats screen + localStorage
- Sprite swap-in when art is ready (placeholder → real sprites)
- Sound effects + music
- 2–3 hand-crafted maps
- Particle effects (hit sparks, block debris, pickups)

### Phase 5 — Multiplayer (future)
- WebSocket server (Node.js)
- Client-server architecture
- Lobby / room system

---

## 13. Open Questions

All design questions resolved for now. See relevant sections for answers.
