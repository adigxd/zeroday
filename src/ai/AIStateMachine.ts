import { Entity, EntityCallbacks, Direction, ProjectileInfo } from '../entities/Entity';
import { MapData, T_FLOOR, T_BLOCK, T_CRATE, T_HOLE, T_SOLID } from '../systems/MapManager';
import { MOVE_DURATION, AI_CPS, WEAPON_RANGES } from '../config/GameConfig';
import { rollDrop } from '../systems/DropSystem';

type AIState = 'wander' | 'chase' | 'attack' | 'flee' | 'seek_crate' | 'seek_item';

export class AIPlayer extends Entity {
  private state: AIState = 'wander';
  private moveCooldown = 0;
  private blockCooldown = 0;
  private lastClickType: 'left' | 'right' = 'right';
  private difficulty: string;
  private wanderDir: Direction = 'down';
  private wanderTimer = 0;
  private cpsMs: number;
  // Cooldown before the AI reconsiders its state (prevents thrashing)
  private stateTimer = 0;
  // Cached crate target so AI commits to seeking it
  private crateTarget: { col: number; row: number } | null = null;
  // Cached floor-item target
  private itemTarget: { col: number; row: number; item: string } | null = null;
  // Committed dodge direction — held until threat clears or move is blocked
  private dodgeDir: Direction | null = null;
  // Opposite of dodgeDir — forbidden while a dodge is active to prevent jitter
  private avoidDir: Direction | null = null;


  constructor(
    scene: Phaser.Scene,
    id: string,
    colorName: string,
    col: number,
    row: number,
    offsetY: number,
    difficulty: string,
    callbacks: EntityCallbacks,
  ) {
    super(scene, id, colorName, col, row, offsetY, callbacks);
    this.difficulty = difficulty;
    this.cpsMs = 1000 / (AI_CPS[difficulty] ?? 4);
    // Movement speed scales with difficulty: Easy=250ms, Medium=187ms, Hard=125ms (half player speed)
    this.moveDuration = difficulty === 'hard' ? 125 : difficulty === 'medium' ? 187 : 250;
    this.moveCooldown = Math.random() * MOVE_DURATION;
    this.wanderTimer = Math.random() * 600;
  }

  update(delta: number, map: MapData) {
    if (!this.alive) return;
    super.update(delta, map);

    this.moveCooldown  = Math.max(0, this.moveCooldown  - delta);
    this.blockCooldown = Math.max(0, this.blockCooldown - delta);
    this.stateTimer    = Math.max(0, this.stateTimer    - delta);

    // Dodge incoming projectiles before running the state machine
    this.checkDodge(map);

    const target = this.findNearestTarget();
    this.updateState(target, map);

    switch (this.state) {
      case 'wander':     this.doWander(delta, map); break;
      case 'chase':      this.doChase(target!, map); break;
      case 'attack':     this.doAttack(target!, map); break;
      case 'flee':       this.doFlee(target, map); break;
      case 'seek_crate': this.doSeekCrate(map); break;
      case 'seek_item':  this.doSeekItem(map); break;
    }

    // Opportunistic ranged shot — aligned on same row/col, within weapon range, clear LOS
    if (target && !['knife','mace','sword'].includes(this.weapon) && this.canAttack()) {
      if (this.col === target.col || this.row === target.row) {
        const shotDist = Math.abs(this.col - target.col) + Math.abs(this.row - target.row);
        const weaponRange = WEAPON_RANGES[this.weapon] ?? 9999;
        if (shotDist <= weaponRange && this.hasLOS(target, map)) {
          this.faceToward(target);
          this.attack(map);
        }
      }
    }
  }

  private findNearestTarget(): Entity | undefined {
    const all = this.callbacks.getAllEntities();
    let nearest: Entity | undefined;
    let minDist = Infinity;
    for (const e of all) {
      if (!e.alive || e.id === this.id) continue;
      const d = Math.abs(this.col - e.col) + Math.abs(this.row - e.row);
      if (d < minDist) { minDist = d; nearest = e; }
    }
    return nearest;
  }

  private updateState(target: Entity | undefined, map: MapData) {
    if (!target) { this.state = 'wander'; return; }

    const dist = Math.abs(this.col - target.col) + Math.abs(this.row - target.row);

    // ── Flee when low HP ──────────────────────────────────────────────────
    const fleeHp = this.difficulty === 'easy' ? 12 : this.difficulty === 'medium' ? 18 : 0;
    if (this.hp <= fleeHp) {
      this.state = 'flee';
      this.crateTarget = null;
      this.itemTarget = null;
      return;
    }

    // ── Nearby medkit — always grab if HP < 80, regardless of other state ─
    const medkitRadius = this.difficulty === 'easy' ? 5 : this.difficulty === 'medium' ? 9 : 14;
    if (this.hp < 80) {
      const medkit = this.findNearbyFloorItem(medkitRadius, 'medkit');
      if (medkit && (this.state !== 'seek_item' || this.itemTarget?.item !== 'medkit')) {
        this.itemTarget = medkit;
        this.state = 'seek_item';
        return;
      }
    }

    // ── Nearby weapon upgrade — grab if holding knife or in wander/seek_item ─
    const weaponRadius = this.difficulty === 'easy' ? 4 : this.difficulty === 'medium' ? 7 : 12;
    const weaponChance = this.difficulty === 'easy' ? 0.45 : this.difficulty === 'medium' ? 0.65 : 0.85;
    const wantsWeapon  = this.weapon === 'knife' || this.state === 'wander' || this.state === 'seek_item';
    if (wantsWeapon && Math.random() < weaponChance) {
      const weapon = this.findNearbyFloorItem(weaponRadius,
        this.weapon === 'knife' ? undefined : 'weapon');
      if (weapon && weapon.item !== 'knife') {
        // Don't break away from a close chase for a weapon
        const interruptDist = this.difficulty === 'easy' ? 3 : 6;
        if (dist > interruptDist || this.state !== 'chase') {
          this.itemTarget = weapon;
          this.state = 'seek_item';
          return;
        }
      }
    }

    // ── Adjacent → melee attack ───────────────────────────────────────────
    if (dist === 1) {
      this.state = 'attack';
      this.crateTarget = null;
      this.itemTarget = null;
      return;
    }

    // ── Chase range (scales with difficulty) ──────────────────────────────
    const chaseRange = this.difficulty === 'easy' ? 10
                     : this.difficulty === 'medium' ? 20
                     : 999;

    if (dist <= chaseRange) {
      // Keep going if already mid-seek and enemy isn't right on top of us
      if ((this.state === 'seek_crate' || this.state === 'seek_item') && dist > 4) {
        return;
      }

      // Knife holders: commit to any nearby crate whenever enemy isn't in close range.
      // No timer gate — they're starved for a real weapon and act on it immediately.
      if (this.weapon === 'knife' && dist > 5) {
        const crateRadius = this.difficulty === 'easy' ? 5 : this.difficulty === 'medium' ? 8 : 10;
        const crate = this.findNearbyCrate(map, crateRadius, true);
        if (crate) {
          this.crateTarget = crate;
          this.state = 'seek_crate';
          this.stateTimer = 1200 + Math.random() * 800;
          return;
        }
      }

      // Periodically consider breaking off chase to grab nearby resources.
      // Knife holders prioritise crates heavily (need a real weapon).
      // Weapon holders are less likely to divert.
      if (dist > 3 && this.stateTimer <= 0) {
        const hasKnife = this.weapon === 'knife';
        const baseDiversion = this.difficulty === 'easy' ? 0.45
                            : this.difficulty === 'medium' ? 0.28
                            : 0.12;
        const diversionChance = hasKnife
          ? Math.min(0.85, baseDiversion * 1.8)
          : 0.22; // flat across difficulties — weapon holders always have some crate interest

        if (Math.random() < diversionChance) {
          const iRadius = this.difficulty === 'easy' ? 5 : this.difficulty === 'medium' ? 6 : 5;
          const cRadius = this.difficulty === 'easy' ? 4 : this.difficulty === 'medium' ? 5 : 4;
          // Knife holders check crates first; weapon holders check floor items first
          if (hasKnife) {
            const divCrate = this.findNearbyCrate(map, cRadius, true);
            if (divCrate) { this.crateTarget = divCrate; this.state = 'seek_crate'; this.stateTimer = 1200 + Math.random() * 800; return; }
          }
          const divItem = this.findNearbyFloorItem(iRadius, 'weapon');
          if (divItem) { this.itemTarget = divItem; this.state = 'seek_item'; this.stateTimer = 1000 + Math.random() * 800; return; }
          if (!hasKnife) {
            const divCrate = this.findNearbyCrate(map, cRadius, true);
            if (divCrate) { this.crateTarget = divCrate; this.state = 'seek_crate'; this.stateTimer = 1200 + Math.random() * 800; return; }
          }
        }
        this.stateTimer = 700 + Math.random() * 600;
      }

      this.state = 'chase';
      this.crateTarget = null;
      this.itemTarget = null;
      return;
    }

    // ── Knife holders proactively seek crates when player is far away ────────
    // Weapon holders don't — they just wander. Crate diversion for weapon
    // holders happens via the 22% mid-chase roll, not when the player is far.
    if (this.weapon === 'knife' && this.stateTimer <= 0) {
      const crateRadius = this.difficulty === 'easy' ? 4 : this.difficulty === 'medium' ? 8 : 12;
      const baseChance  = this.difficulty === 'easy' ? 0.35 : this.difficulty === 'medium' ? 0.55 : 0.75;
      const crateChance = Math.min(0.92, baseChance * 1.6);

      if (Math.random() < crateChance) {
        const crate = this.findNearbyCrate(map, crateRadius, true);
        if (crate) {
          this.crateTarget = crate;
          this.state = 'seek_crate';
          this.stateTimer = 2000 + Math.random() * 2000;
          return;
        }
      }
      this.stateTimer = 800 + Math.random() * 800;
    }

    if (this.state !== 'seek_crate' && this.state !== 'seek_item') this.state = 'wander';
  }

  // ── State handlers ───────────────────────────────────────────────────────

  private doWander(delta: number, map: MapData) {
    this.wanderTimer -= delta;

    if (this.wanderTimer <= 0) {
      // Occasionally bias toward center or just pick random direction
      this.wanderDir = this.randomDir();
      this.wanderTimer = 400 + Math.random() * 700;
    }

    // Only attempt movement when cooldown has expired — prevents mis-firing the blocked branch
    // while the previous move tween is still in flight
    if (this.moveCooldown <= 0) {
      if (!this.tryMoveDir(this.wanderDir, map)) {
        const nc = this.col + (this.wanderDir === 'right' ? 1 : this.wanderDir === 'left' ? -1 : 0);
        const nr = this.row + (this.wanderDir === 'down'  ? 1 : this.wanderDir === 'up'   ? -1 : 0);
        const bt = map.tiles[nr]?.[nc];
        if ((bt === T_BLOCK || bt === T_CRATE) && this.blockCooldown <= 0) {
          this.faceTowardTile(nc, nr);
          this.doBlockHit(nc, nr, map);
        } else {
          this.wanderDir = this.randomDir();
          this.wanderTimer = 200 + Math.random() * 400;
        }
      }
    }

    // Opportunistic crate break while wandering
    this.tryOpportunisticCrateHit(map);
  }

  private doChase(target: Entity, map: MapData) {
    const path = this.bfs(map, { col: this.col, row: this.row }, { col: target.col, row: target.row });
    if (!path || path.length < 2) {
      // BFS failed — try breaking a breakable tile in the rough direction of the target
      const dc = Math.sign(target.col - this.col);
      const dr = Math.sign(target.row - this.row);
      const nc = this.col + (Math.abs(dc) >= Math.abs(dr) ? dc : 0);
      const nr = this.row + (Math.abs(dr) >  Math.abs(dc) ? dr : 0);
      const bt = map.tiles[nr]?.[nc];
      if ((bt === T_BLOCK || bt === T_CRATE) && this.blockCooldown <= 0) {
        this.faceTowardTile(nc, nr);
        this.doBlockHit(nc, nr, map);
      } else {
        this.state = 'wander';
      }
      return;
    }

    const next = path[1];
    const dir = this.vecToDir(next.col - this.col, next.row - this.row);
    if (dir) this.tryMoveDir(dir, map);

    // Melee attack if adjacent
    if (['knife','mace','sword'].includes(this.weapon)) {
      const adjDist = Math.abs(this.col - target.col) + Math.abs(this.row - target.row);
      if (adjDist === 1 && this.canAttack()) {
        this.faceToward(target);
        this.attack(map);
      }
    }

    this.tryOpportunisticCrateHit(map);
  }

  private doAttack(target: Entity, map: MapData) {
    this.faceToward(target);
    if (this.canAttack()) this.attack(map);

    // If we've drifted out of adjacency for melee, go back to chase
    if (['knife','mace','sword'].includes(this.weapon)) {
      const d = Math.abs(this.col - target.col) + Math.abs(this.row - target.row);
      if (d > 1) this.state = 'chase';
    }
  }

  private doFlee(target: Entity | undefined, map: MapData) {
    // If there's a floor medkit nearby, go for it instead of fleeing
    const floorMedkit = this.findNearbyFloorItem(6, 'medkit');
    if (floorMedkit) {
      const path = this.bfs(map, { col: this.col, row: this.row }, floorMedkit);
      if (path && path.length >= 2) {
        const next = path[1];
        const dir = this.vecToDir(next.col - this.col, next.row - this.row);
        if (dir) this.tryMoveDir(dir, map);
        return;
      }
    }

    if (target) {
      const awayDir = this.dirAwayFrom(target);
      if (!this.tryMoveDir(awayDir, map)) this.tryMoveDir(this.randomDir(), map);
    }

    // Break adjacent crate while fleeing (medkit hunting)
    const crate = this.findNearbyCrate(map, 1, true);
    if (crate && this.blockCooldown <= 0) {
      this.faceTowardTile(crate.col, crate.row);
      this.doBlockHit(crate.col, crate.row, map);
    }
  }

  private doSeekCrate(map: MapData) {
    // Abandon crate-seeking if an enemy closes in too tight
    const threatEnemy = this.findNearestTarget();
    if (threatEnemy) {
      const threatDist = Math.abs(this.col - threatEnemy.col) + Math.abs(this.row - threatEnemy.row);
      if (threatDist <= 3) {
        this.crateTarget = null;
        this.state = 'chase';
        return;
      }
    }

    // Verify target still exists (accept T_CRATE or T_BLOCK — both are breakable)
    const targetTile = map.tiles[this.crateTarget?.row ?? -1]?.[this.crateTarget?.col ?? -1];
    if (!this.crateTarget || (targetTile !== T_CRATE && targetTile !== T_BLOCK)) {
      this.crateTarget = this.findNearbyCrate(map, 12);
      if (!this.crateTarget) { this.state = 'wander'; return; }
    }

    const dist = Math.abs(this.col - this.crateTarget.col) + Math.abs(this.row - this.crateTarget.row);
    if (dist === 1) {
      this.faceTowardTile(this.crateTarget.col, this.crateTarget.row);
      if (this.blockCooldown <= 0) this.doBlockHit(this.crateTarget.col, this.crateTarget.row, map);
    } else {
      // BFS to a floor tile adjacent to the crate, not the crate tile itself
      // (crate tiles are excluded from BFS traversal, so they can't be destinations)
      const goal = this.adjacentFloor(this.crateTarget, map);
      if (!goal) { this.state = 'wander'; return; }
      const path = this.bfs(map, { col: this.col, row: this.row }, goal);
      if (!path || path.length < 2) { this.state = 'wander'; return; }
      const next = path[1];
      const dir = this.vecToDir(next.col - this.col, next.row - this.row);
      if (dir) this.tryMoveDir(dir, map);
    }
  }


  // Called during chase/wander — if a crate is nearby, roll a chance to commit to breaking it
  private tryOpportunisticCrateHit(map: MapData) {
    if (this.stateTimer > 0) return; // don't thrash
    const chance = this.difficulty === 'easy' ? 0.18 : this.difficulty === 'medium' ? 0.42 : 0.72;
    if (Math.random() > chance) return;
    const radius = this.difficulty === 'easy' ? 2 : 3;
    const crate = this.findNearbyCrate(map, radius, true);
    if (crate) {
      this.crateTarget = crate;
      this.state = 'seek_crate';
      this.stateTimer = 1200 + Math.random() * 800;
    }
  }

  private checkDodge(map: MapData) {
    if (this.isMoving() || this.moveCooldown > 0) return;

    const dodgeChance = this.difficulty === 'easy' ? 0.22 : this.difficulty === 'medium' ? 0.52 : 0.82;

    const THREAT_TILES = 5;
    const projectiles = this.callbacks.getProjectiles();

    // Find if any threat is still incoming
    let perpDirs: Direction[] | null = null;
    for (const p of projectiles) {
      if (p.ownerId === this.id) continue;
      if ((p.dir === 'right' && p.row === this.row && p.col < this.col && this.col - p.col <= THREAT_TILES) ||
          (p.dir === 'left'  && p.row === this.row && p.col > this.col && p.col - this.col <= THREAT_TILES)) {
        perpDirs = ['up', 'down'];
        break;
      } else if ((p.dir === 'down' && p.col === this.col && p.row < this.row && this.row - p.row <= THREAT_TILES) ||
                 (p.dir === 'up'   && p.col === this.col && p.row > this.row && p.row - this.row <= THREAT_TILES)) {
        perpDirs = ['left', 'right'];
        break;
      }
    }

    const OPPOSITES: Record<Direction, Direction> = { up:'down', down:'up', left:'right', right:'left' };

    if (!perpDirs) {
      // No threat — clear dodge commitment so the AI moves freely again
      this.dodgeDir = null;
      this.avoidDir = null;
      return;
    }

    // Commit to a direction once; don't re-randomize each tick
    if (!this.dodgeDir) {
      this.dodgeDir = Math.random() < 0.5 ? perpDirs[0] : perpDirs[1];
      this.avoidDir = OPPOSITES[this.dodgeDir];
    }

    if (Math.random() < dodgeChance) {
      const other = this.dodgeDir === perpDirs[0] ? perpDirs[1] : perpDirs[0];
      const moved = this.tryMoveDir(this.dodgeDir, map);
      if (!moved) {
        // Primary direction blocked — try the other side and commit to it
        if (this.tryMoveDir(other, map)) {
          this.dodgeDir = other;
          this.avoidDir = OPPOSITES[other];
        } else {
          // Both sides blocked — clear so we can repick when unblocked
          this.dodgeDir = null;
          this.avoidDir = null;
        }
      }
    }
  }

  private doSeekItem(map: MapData) {
    // Re-validate: item might have been picked up by someone else
    const floorItems = this.getFloorItems();
    if (!this.itemTarget || !floorItems.has(`${this.itemTarget.col},${this.itemTarget.row}`)) {
      this.itemTarget = null;
      this.state = 'wander';
      return;
    }

    const dist = Math.abs(this.col - this.itemTarget.col) + Math.abs(this.row - this.itemTarget.row);
    if (dist === 0) {
      // Standing on it — pickup is automatic; clear and re-evaluate
      this.itemTarget = null;
      this.state = 'wander';
      return;
    }

    const path = this.bfs(map, { col: this.col, row: this.row }, this.itemTarget);
    if (!path || path.length < 2) { this.itemTarget = null; this.state = 'wander'; return; }
    const next = path[1];
    const dir = this.vecToDir(next.col - this.col, next.row - this.row);
    if (dir) this.tryMoveDir(dir, map);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private tryMoveDir(dir: Direction, map: MapData): boolean {
    if (this.moveCooldown > 0 || this.isMoving()) return false;
    // Block movement opposite to an active dodge to prevent jitter
    if (this.avoidDir && dir === this.avoidDir) return false;
    // Hesitation makes easy/medium feel less robotic
    const hesitate = this.difficulty === 'easy' ? 0.35 : this.difficulty === 'medium' ? 0.12 : 0;
    if (Math.random() < hesitate) return false;
    const before = { col: this.col, row: this.row };
    this.moveTo(dir, map);
    const moved = this.col !== before.col || this.row !== before.row;
    if (moved) this.moveCooldown = this.moveDuration;
    return moved;
  }

  private doBlockHit(tc: number, tr: number, map: MapData) {
    this.blockCooldown = this.cpsMs;
    this.lastClickType = this.lastClickType === 'left' ? 'right' : 'left';

    const hp = map.blockHp[tr]?.[tc];
    if (!hp || hp <= 0) return;

    map.blockHp[tr][tc]--;
    if (map.blockHp[tr][tc] <= 0) {
      const wasCrate = map.tiles[tr][tc] === T_CRATE;
      map.tiles[tr][tc] = T_FLOOR;
      map.blockHp[tr][tc] = 0;
      this.callbacks.onBlockBreak(this);
      if (wasCrate) {
        const drop = rollDrop();
        if (drop !== 'nothing') this.callbacks.spawnFloorItem(tc, tr, drop);
      }
      this.crateTarget = null;
    }
    (this.scene as any).__dirtyTiles?.add(`${tc},${tr}`);
  }

  private faceToward(other: Entity) {
    this.faceTowardTile(other.col, other.row);
  }

  private faceTowardTile(tc: number, tr: number) {
    const dir = this.vecToDir(tc - this.col, tr - this.row);
    if (dir) {
      this.facing = dir;
      this.updateBodyRotation(dir);
    }
  }

  private vecToDir(dc: number, dr: number): Direction | null {
    if (dc === 0 && dr === 0) return null;
    if (Math.abs(dc) >= Math.abs(dr)) return dc > 0 ? 'right' : 'left';
    return dr > 0 ? 'down' : 'up';
  }

  private dirAwayFrom(other: Entity): Direction {
    const dc = this.col - other.col;
    const dr = this.row - other.row;
    if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 'right' : 'left';
    return dr >= 0 ? 'down' : 'up';
  }

  private randomDir(): Direction {
    return (['up','down','left','right'] as Direction[])[Math.floor(Math.random() * 4)];
  }

  private getFloorItems(): Map<string, { col: number; row: number; item: string }> {
    return (this.scene as any).__floorItems ?? new Map();
  }

  // filter: 'medkit' = only medkits, 'weapon' = only weapons/items (not medkit/shield/knife),
  //         undefined = anything
  private findNearbyFloorItem(
    radius: number,
    filter?: 'medkit' | 'weapon',
  ): { col: number; row: number; item: string } | null {
    const floorItems = this.getFloorItems();
    let best: { col: number; row: number; item: string } | null = null;
    let bestDist = Infinity;

    for (const entry of floorItems.values()) {
      const d = Math.abs(this.col - entry.col) + Math.abs(this.row - entry.row);
      if (d > radius) continue;

      if (filter === 'medkit' && entry.item !== 'medkit') continue;
      if (filter === 'weapon' && ['medkit', 'shield', 'knife'].includes(entry.item)) continue;

      if (d < bestDist) { bestDist = d; best = entry; }
    }
    return best;
  }

  private hasLOS(target: Entity, map: MapData): boolean {
    if (this.col !== target.col && this.row !== target.row) return false;
    const dc = Math.sign(target.col - this.col);
    const dr = Math.sign(target.row - this.row);
    let c = this.col + dc, r = this.row + dr;
    while (c !== target.col || r !== target.row) {
      if (map.tiles[r]?.[c] !== T_FLOOR) return false;
      c += dc; r += dr;
    }
    return true;
  }

  private adjacentFloor(
    target: { col: number; row: number }, map: MapData,
  ): { col: number; row: number } | null {
    for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nc = target.col + dc, nr = target.row + dr;
      if (map.tiles[nr]?.[nc] === T_FLOOR) return { col: nc, row: nr };
    }
    return null;
  }

  // crateOnly=true → only T_CRATE (has loot); false → T_CRATE or T_BLOCK.
  // Diversions and opportunistic checks use crateOnly=true so the AI only
  // breaks off for tiles that reward it. T_BLOCK is accepted as a fallback
  // inside doSeekCrate once the AI is already committed to a target.
  private findNearbyCrate(map: MapData, radius: number, crateOnly = false): { col: number; row: number } | null {
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = this.row + dr, c = this.col + dc;
        const t = map.tiles[r]?.[c];
        if (t === T_CRATE || (!crateOnly && t === T_BLOCK)) {
          const d = Math.abs(dr) + Math.abs(dc);
          if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
        }
      }
    }
    return best;
  }

  private bfs(
    map: MapData,
    from: { col: number; row: number },
    to:   { col: number; row: number },
  ): { col: number; row: number }[] | null {
    const key = (c: number, r: number) => `${c},${r}`;
    const visited = new Set<string>([key(from.col, from.row)]);
    const queue: { col: number; row: number; path: { col: number; row: number }[] }[] = [
      { ...from, path: [from] },
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.col === to.col && cur.row === to.row) return cur.path;

      for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nc = cur.col + dc, nr = cur.row + dr;
        const k = key(nc, nr);
        if (visited.has(k)) continue;
        visited.add(k);
        const tile = map.tiles[nr]?.[nc];
        if (tile === undefined || tile === T_HOLE || tile === T_SOLID || tile === T_BLOCK || tile === T_CRATE) continue;
        queue.push({ col: nc, row: nr, path: [...cur.path, { col: nc, row: nr }] });
      }
    }
    return null;
  }
}
