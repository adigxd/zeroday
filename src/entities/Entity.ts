import Phaser from 'phaser';
import { TILE_SIZE, TILE_OFFSET_X, MOVE_DURATION, PLAYER_COLORS, WEAPON_DAMAGES, WEAPON_COOLDOWNS, GUN_LINE_COLORS, WEAPON_RANGES, BOW_ARROW_SPEED, RPG_SPEED, RPG_AOE_MULT } from '../config/GameConfig';
import { WeaponId } from '../weapons/Weapon';
import { T_HOLE, T_SOLID, T_BLOCK, T_CRATE, MapData } from '../systems/MapManager';
import { rollDrop } from '../systems/DropSystem';

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up:    { dr: -1, dc: 0 },
  down:  { dr:  1, dc: 0 },
  left:  { dr:  0, dc: -1 },
  right: { dr:  0, dc:  1 },
};

export interface ProjectileInfo {
  col: number;
  row: number;
  dir: Direction;
  ownerId: string;
}

export interface EntityCallbacks {
  onDamage: (source: Entity, target: Entity, amount: number) => void;
  onDeath:  (entity: Entity) => void;
  onPickup: (entity: Entity, item: string) => void;
  onBlockBreak: (entity: Entity) => void;
  onShotFired: (entity: Entity) => void;
  getAllEntities: () => Entity[];
  getMap: () => MapData;
  getProjectiles: () => ProjectileInfo[];
  spawnFloorItem: (col: number, row: number, item: string) => void;
  spawnArrow: (col: number, row: number, dir: Direction, damage: number, ownerId: string, isRpg: boolean) => void;
}

export class Entity {
  id: string;
  colorName: string;
  col: number;
  row: number;
  hp: number;
  maxHp = 100;
  facing: Direction = 'down';
  weapon: WeaponId = 'knife';
  shieldHp = 0;
  alive = true;

  protected scene: Phaser.Scene;
  protected callbacks: EntityCallbacks;
  protected moveDuration = MOVE_DURATION; // overridden by Player for faster input

  // Phaser display objects
  body!:      Phaser.GameObjects.Image;
  leftHand!:  Phaser.GameObjects.Image;
  rightHand!: Phaser.GameObjects.Image;
  shieldAura!: Phaser.GameObjects.Arc;
  healthBar?:  Phaser.GameObjects.Graphics;

  private attackCooldown = 0;
  private handBobTime = 0;
  private moving = false;
  private offsetY = 0; // score bar height, added externally

  constructor(scene: Phaser.Scene, id: string, colorName: string, col: number, row: number, offsetY: number, callbacks: EntityCallbacks) {
    this.scene = scene;
    this.id = id;
    this.colorName = colorName;
    this.col = col;
    this.row = row;
    this.hp = this.maxHp;
    this.offsetY = offsetY;
    this.callbacks = callbacks;

    this.buildSprite();
  }

  private buildSprite() {
    const { x, y } = this.tileToWorld(this.col, this.row);
    const bodySize = TILE_SIZE * 0.78;
    const handSize = TILE_SIZE * 0.34;

    this.body = this.scene.add.image(x, y, 'character_body')
      .setDisplaySize(bodySize, bodySize)
      .setDepth(10);

    this.leftHand  = this.scene.add.image(x, y, 'character_hand')
      .setDisplaySize(handSize, handSize)
      .setDepth(9);
    this.rightHand = this.scene.add.image(x, y, 'character_hand')
      .setDisplaySize(handSize, handSize)
      .setDepth(9);

    if (this.colorName !== 'white') {
      const tint = PLAYER_COLORS[this.colorName] ?? 0xffffff;
      this.body.setTint(tint);
      this.leftHand.setTint(tint);
      this.rightHand.setTint(tint);
    }

    // Shield bubble — always exists, hidden until shield is active
    this.shieldAura = this.scene.add.circle(x, y, TILE_SIZE * 0.5, 0, 0)
      .setStrokeStyle(3, 0x88ccff, 0)
      .setAlpha(0)
      .setDepth(8);

    this.healthBar = this.scene.add.graphics().setDepth(20);
    this.updateHandPositions(0);
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2 + TILE_OFFSET_X,
      y: row * TILE_SIZE + TILE_SIZE / 2 + this.offsetY,
    };
  }

  moveTo(dir: Direction, map: MapData): boolean {
    if (this.moving) return false;
    this.facing = dir;
    this.updateBodyRotation(dir); // always rotate body when facing changes, even if blocked
    const delta = DIR_DELTA[dir];
    const newCol = this.col + delta.dc;
    const newRow = this.row + delta.dr;

    const tile = map.tiles[newRow]?.[newCol];
    if (tile === undefined || tile === T_HOLE || tile === T_SOLID || tile === T_BLOCK || tile === T_CRATE) return false;

    // Check if another entity occupies that tile
    const others = this.callbacks.getAllEntities().filter(e => e !== this && e.alive);
    if (others.some(e => e.col === newCol && e.row === newRow)) return false;

    this.col = newCol;
    this.row = newRow;
    this.moving = true;

    const { x, y } = this.tileToWorld(newCol, newRow);
    const duration = this.moveDuration;

    this.scene.tweens.add({
      targets: this.body,
      x,
      y,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.updateHandPositions(this.handBobTime),
      onComplete: () => {
        this.moving = false;
        this.checkPickup();
      },
    });
    return true;
  }

  private checkPickup() {
    const map = this.callbacks.getMap();
    const floorItems = (this.scene as any).__floorItems as Map<string, { col: number; row: number; item: string; objects: Phaser.GameObjects.GameObject[] }> | undefined;
    if (!floorItems) return;

    const key = `${this.col},${this.row}`;
    const entry = floorItems.get(key);
    if (!entry) return;

    // Consume the item
    entry.objects.forEach(o => o.destroy());
    floorItems.delete(key);
    this.applyItem(entry.item);
    this.callbacks.onPickup(this, entry.item);
  }

  applyItem(item: string) {
    if (['knife','mace','sword','pistol','rifle','sniper','laser','bow','rpg'].includes(item)) {
      this.weapon = item as WeaponId;
      this.updateHandPositions(0);
    } else if (item === 'medkit') {
      this.hp = Math.min(this.maxHp, this.hp + 40);
      this.drawHealthBar();
    } else if (item === 'shield') {
      this.shieldHp = 30;
      this.updateShieldAura();
    }
  }

  attack(map: MapData) {
    if (this.attackCooldown > 0) return;
    if (this.isMoving()) return; // wait until body tween completes so logical pos matches visual
    this.attackCooldown = WEAPON_COOLDOWNS[this.weapon] ?? 500;

    const isMelee = ['knife','mace','sword'].includes(this.weapon);
    if (isMelee) {
      this.doMeleeAttack(map);
    } else {
      this.doRangedAttack(map);
      this.callbacks.onShotFired(this);
    }
  }

  private doMeleeAttack(map: MapData) {
    const delta = DIR_DELTA[this.facing];
    const frontCol = this.col + delta.dc;
    const frontRow = this.row + delta.dr;
    const damage = WEAPON_DAMAGES[this.weapon];

    // Hit entities in front (melee weapons cannot break blocks — only alternating clicks do)
    const entities = this.callbacks.getAllEntities();
    for (const e of entities) {
      if (!e.alive || e === this) continue;
      if (e.col === frontCol && e.row === frontRow) {
        this.dealDamage(e, damage);
      }
    }

    // Diagonal hits for sword and mace (half damage)
    if (this.weapon === 'sword' || this.weapon === 'mace') {
      const halfDamage = Math.floor(damage / 2);
      const diagonals = this.getDiagonals();
      for (const { col: dc2, row: dr2 } of diagonals) {
        for (const e of entities) {
          if (!e.alive || e === this) continue;
          if (e.col === dc2 && e.row === dr2) {
            this.dealDamage(e, halfDamage);
          }
        }
      }
    }

    this.animateAttack();
    this.showMeleeSwing();
  }

  private getDiagonals(): { col: number; row: number }[] {
    const delta = DIR_DELTA[this.facing];
    if (delta.dr !== 0) {
      // Facing up or down — diagonals are front±1 col
      return [
        { col: this.col - 1, row: this.row + delta.dr },
        { col: this.col + 1, row: this.row + delta.dr },
      ];
    } else {
      // Facing left or right — diagonals are front±1 row
      return [
        { col: this.col + delta.dc, row: this.row - 1 },
        { col: this.col + delta.dc, row: this.row + 1 },
      ];
    }
  }

  private hitBlock(col: number, row: number, map: MapData) {
    const hp = map.blockHp[row]?.[col];
    if (hp === undefined || hp <= 0) return;
    const maceBonus = this.weapon === 'mace' ? 1 : 0;
    map.blockHp[row][col] -= (1 + maceBonus);
    if (map.blockHp[row][col] <= 0) {
      const wasCrate = map.tiles[row][col] === T_CRATE;
      map.tiles[row][col] = 0; // floor
      map.blockHp[row][col] = 0;
      this.callbacks.onBlockBreak(this);
      if (wasCrate) {
        const drop = rollDrop();
        if (drop !== 'nothing') {
          this.callbacks.spawnFloorItem(col, row, drop);
        }
      }
      // Notify scene to redraw that tile
      (this.scene as any).__dirtyTiles?.add(`${col},${row}`);
    } else {
      (this.scene as any).__dirtyTiles?.add(`${col},${row}`);
    }
  }

  private doRangedAttack(map: MapData) {
    const delta = DIR_DELTA[this.facing];
    const damage = WEAPON_DAMAGES[this.weapon];
    const maxRange = WEAPON_RANGES[this.weapon] ?? 9999;

    // Don't fire if a solid object is directly in front (holes are fine — projectiles pass over)
    const frontTile = map.tiles[this.row + delta.dr]?.[this.col + delta.dc];
    if (frontTile === T_SOLID || frontTile === T_BLOCK || frontTile === T_CRATE) return;

    if (this.weapon === 'laser') {
      this.fireLaser(map, delta, damage);
      return;
    }

    if (this.weapon === 'bow' || this.weapon === 'rpg') {
      this.callbacks.spawnArrow(this.col, this.row, this.facing, damage, this.id, this.weapon === 'rpg');
      return;
    }

    // Instant gun — trace from the first tile ahead
    let hitCol = this.col + delta.dc;
    let hitRow = this.row + delta.dr;
    let distance = 0;
    let hitEntity: Entity | null = null;

    while (distance < maxRange) {
      const tile = map.tiles[hitRow]?.[hitCol];
      if (tile === undefined || tile === T_SOLID || tile === T_BLOCK || tile === T_CRATE) break;

      const entities = this.callbacks.getAllEntities();
      hitEntity = entities.find(e => e.alive && e !== this && e.col === hitCol && e.row === hitRow) ?? null;
      if (hitEntity) break;

      hitCol += delta.dc;
      hitRow += delta.dr;
      distance++;
    }

    this.drawGunLine(hitCol, hitRow, hitEntity !== null);
    if (hitEntity) this.dealDamage(hitEntity, damage);
  }

  private fireLaser(map: MapData, initialDelta: { dr: number; dc: number }, damage: number) {
    const bounceLeft = Math.random() < 0.5;
    const entities = this.callbacks.getAllEntities();
    const linePoints: { x: number; y: number }[] = [this.tileToWorld(this.col, this.row)];

    let col = this.col;
    let row = this.row;
    let dir = { ...initialDelta };
    let bounced = false;

    // Advance step by step; stop at the last valid tile before any obstacle
    while (true) {
      const nextCol = col + dir.dc;
      const nextRow = row + dir.dr;
      const tile = map.tiles[nextRow]?.[nextCol];

      if (tile === undefined || tile === T_SOLID || tile === T_BLOCK || tile === T_CRATE) {
        // Record stop point at center of last valid tile
        linePoints.push(this.tileToWorld(col, row));

        if (bounced) break; // Second stop — laser ends

        // First bounce: rotate 90° left or right relative to travel
        bounced = true;
        dir = bounceLeft
          ? { dr: -dir.dc, dc:  dir.dr }
          : { dr:  dir.dc, dc: -dir.dr };
        continue;
      }

      col = nextCol;
      row = nextRow;

      // Pass through entities
      for (const e of entities) {
        if (e.alive && e !== this && e.col === col && e.row === row) {
          this.dealDamage(e, damage);
        }
      }
    }

    this.drawLaserLine(linePoints);
  }

  private drawGunLine(endCol: number, endRow: number, _hit: boolean) {
    const lineColor = GUN_LINE_COLORS[this.weapon] ?? 0xffffff;
    const cooldown = WEAPON_COOLDOWNS[this.weapon] ?? 500;
    const fadeDuration = cooldown * 0.85;

    const { x: x1, y: y1 } = this.tileToWorld(this.col, this.row);
    const { x: x2, y: y2 } = this.tileToWorld(endCol, endRow);

    const g = this.scene.add.graphics().setDepth(15);
    g.lineStyle(2, lineColor, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: fadeDuration,
      onComplete: () => g.destroy(),
    });
  }

  private drawLaserLine(points: { x: number; y: number }[]) {
    if (points.length < 2) return;
    const cooldown = WEAPON_COOLDOWNS['laser'];
    const fadeDuration = cooldown * 0.85;

    const g = this.scene.add.graphics().setDepth(15);
    g.lineStyle(3, GUN_LINE_COLORS['laser'], 1);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: fadeDuration,
      onComplete: () => g.destroy(),
    });
  }

  dealDamage(target: Entity, amount: number) {
    if (!target.alive) return;
    let effective = amount;
    if (target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, effective);
      target.shieldHp -= absorbed;
      effective -= absorbed;
      target.updateShieldAura();
    }
    target.hp = Math.max(0, target.hp - effective);
    this.callbacks.onDamage(this, target, amount);

    target.flashHit();
    target.drawHealthBar();

    if (target.hp <= 0) {
      target.die();
    }
  }

  private flashHit() {
    this.body.setTint(0xffffff);
    this.leftHand.setTint(0xffffff);
    this.rightHand.setTint(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.alive) this.restoreTint();
    });
  }

  private restoreTint() {
    if (this.colorName === 'white') {
      this.body.clearTint();
      this.leftHand.clearTint();
      this.rightHand.clearTint();
    } else {
      const tint = PLAYER_COLORS[this.colorName] ?? 0xffffff;
      this.body.setTint(tint);
      this.leftHand.setTint(tint);
      this.rightHand.setTint(tint);
    }
  }

  drawHealthBar() {
    if (!this.healthBar) return;
    this.healthBar.clear();
    if (this.hp >= this.maxHp) return;

    // Use visual body position so bar tracks the tween, not the logical tile
    const x = this.body.x;
    const y = this.body.y;
    const bw = TILE_SIZE * 0.8;
    const bh = 5;
    const bx = x - bw / 2;
    const by = y - TILE_SIZE * 0.55;

    const pct = this.hp / this.maxHp;
    const barColor = pct > 0.6 ? 0x44cc44 : pct > 0.3 ? 0xddcc00 : 0xcc2222;

    this.healthBar.fillStyle(0x111111);
    this.healthBar.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    this.healthBar.fillStyle(barColor);
    this.healthBar.fillRect(bx, by, bw * pct, bh);
  }

  private updateShieldAura() {
    const alpha = this.shieldHp / 30;
    this.shieldAura.setAlpha(alpha);
    this.shieldAura.setStrokeStyle(Math.max(1, 3 * alpha), 0x88ccff, 1);
    this.shieldAura.setPosition(this.body.x, this.body.y);
  }

  private showMeleeSwing() {
    const delta = DIR_DELTA[this.facing];
    const color = this.weapon === 'mace' ? 0x999999 : this.weapon === 'sword' ? 0xaaccff : 0xffffff;

    // Tiles to flash: front tile always, plus diagonals for sword/mace
    const targets: { col: number; row: number; a: number }[] = [
      { col: this.col + delta.dc, row: this.row + delta.dr, a: 0.55 },
    ];
    if (this.weapon === 'sword' || this.weapon === 'mace') {
      for (const d of this.getDiagonals()) {
        targets.push({ col: d.col, row: d.row, a: 0.3 });
      }
    }

    const g = this.scene.add.graphics().setDepth(15);
    for (const t of targets) {
      const { x, y } = this.tileToWorld(t.col, t.row);
      g.fillStyle(color, t.a);
      g.fillRect(x - TILE_SIZE / 2, y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 160,
      ease: 'Power2',
      onComplete: () => g.destroy(),
    });
  }

  private animateAttack() {
    const delta = DIR_DELTA[this.facing];
    const lunge = TILE_SIZE * 0.15;

    this.scene.tweens.add({
      targets: [this.body, this.leftHand, this.rightHand],
      x: `+=${delta.dc * lunge}`,
      y: `+=${delta.dr * lunge}`,
      duration: 80,
      yoyo: true,
    });
  }

  protected updateBodyRotation(dir: Direction) {
    const rotations: Record<Direction, number> = {
      down:  0,
      up:    Math.PI,
      right: -Math.PI / 2,
      left:   Math.PI / 2,
    };
    this.body.setRotation(rotations[dir]);
  }

  updateHandPositions(time: number) {
    const bx = this.body.x;
    const by = this.body.y;
    const bobAmt = Math.sin(time * 0.005) * 3;
    const delta = DIR_DELTA[this.facing];
    // Bob along the facing direction so it looks like reach/sway, not always vertical
    const bobX = delta.dc * bobAmt;
    const bobY = delta.dr * bobAmt;

    const isVertical = this.facing === 'up' || this.facing === 'down';
    const sep = TILE_SIZE * 0.32;
    const px = isVertical  ? sep : 0;
    const py = !isVertical ? sep : 0;

    const isMelee = ['knife','mace','sword'].includes(this.weapon);
    const fw = isMelee ? 0 : TILE_SIZE * 0.22;

    this.leftHand.setPosition(
      bx + delta.dc * fw - px + bobX,
      by + delta.dr * fw - py + bobY,
    );
    this.rightHand.setPosition(
      bx + delta.dc * fw + px + bobX,
      by + delta.dr * fw + py + bobY,
    );
  }

  die() {
    this.alive = false;
    // Snap hands to body one final time before death animation
    this.updateHandPositions(this.handBobTime);
    this.shieldAura.setAlpha(0);

    if (this.weapon !== 'knife') {
      this.callbacks.spawnFloorItem(this.col, this.row, this.weapon);
    }

    const objects = [this.body, this.leftHand, this.rightHand, this.healthBar];
    this.scene.tweens.add({
      targets: objects,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 350,
      ease: 'Power2',
      onComplete: () => objects.forEach(o => (o as Phaser.GameObjects.GameObject).destroy()),
    });
    this.callbacks.onDeath(this);
  }

  update(delta: number, _map: MapData) {
    if (!this.alive) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    this.handBobTime += delta;
    this.updateHandPositions(this.handBobTime);
    this.updateShieldAura();
    this.drawHealthBar();
  }

  getAttackCooldown() { return this.attackCooldown; }
  isMoving() { return this.moving; }
  canAttack() { return this.attackCooldown <= 0; }

  protected resetMovingFlag() {
    this.scene.tweens.killTweensOf(this.body);
    this.moving = false;
  }
}
