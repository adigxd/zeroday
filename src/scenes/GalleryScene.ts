import Phaser from 'phaser';
import {
  CANVAS_W, CANVAS_H,
  BOW_ARROW_SPEED, RPG_SPEED, RPG_AOE_DAMAGE,
  TILE_SIZE, TILE_OFFSET_X,
  setTileSize, setTileOffsetX,
} from '../config/GameConfig';
import { T_SOLID, T_FLOOR, T_BLOCK, T_CRATE, MapData } from '../systems/MapManager';
import { Entity, EntityCallbacks, Direction } from '../entities/Entity';
import { Player } from '../entities/Player';
import { C } from '../config/Colors';
import { ensureCamoTextures } from '../config/CamoTexture';

const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
};

interface ArrowSprite {
  col: number; row: number; dir: Direction; damage: number;
  ownerId: string; isRpg: boolean;
  x: number; y: number;
  rect: Phaser.GameObjects.Rectangle; dead: boolean; tilesMoved: number;
}

interface FloorItemEntry {
  col: number; row: number; item: string;
  objects: Phaser.GameObjects.GameObject[];
}

// Large open room — scrolls both horizontally and vertically
const MAP_W            = 50;
const MAP_H            = 50;
const GALLERY_TS       = 48;
const PLAYER_START_COL = 25;
const PLAYER_START_ROW = 25;

// 6 dummies at cardinal positions, various distances from centre
const DUMMY_POSITIONS: { col: number; row: number }[] = [
  { col: 25, row: 15 }, // 10T north
  { col: 25, row: 35 }, // 10T south
  { col: 15, row: 25 }, // 10T west
  { col: 35, row: 25 }, // 10T east
  { col: 25, row:  5 }, // 20T north (sniper/laser territory)
  { col: 25, row: 45 }, // 20T south
];

// Items in two rows 2 tiles above/below the player spawn
const ITEM_SLOTS: { col: number; row: number; item: string }[] = [
  { col: 22, row: 23, item: 'knife'  },
  { col: 23, row: 23, item: 'mace'   },
  { col: 24, row: 23, item: 'sword'  },
  { col: 25, row: 23, item: 'pistol' },
  { col: 26, row: 23, item: 'rifle'  },
  { col: 27, row: 23, item: 'sniper' },
  { col: 22, row: 27, item: 'laser'  },
  { col: 23, row: 27, item: 'bow'    },
  { col: 24, row: 27, item: 'rpg'    },
  { col: 25, row: 27, item: 'medkit' },
  { col: 26, row: 27, item: 'shield' },
];

const ITEM_COLORS: Record<string, number> = {
  knife: 0xcccccc, mace: 0x888888, sword: 0xaaccff,
  pistol: 0xffcc44, rifle: 0x44ccff, sniper: 0xff8844,
  laser: 0x44ff44, bow: 0xcc8844, rpg: 0xff6622,
  medkit: 0xff4444, shield: 0x4488ff,
};

const DUMMY_RESPAWN_MS = 3000;

export class GalleryScene extends Phaser.Scene {
  // Exposed to Entity via (scene as any)
  __floorItems!: Map<string, FloorItemEntry>;
  __dirtyTiles!: Set<string>;

  private map!: MapData;
  private mapOffsetX = 0;
  private mapTopY = 0;
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private player!: Player;
  private dummies: Entity[] = [];
  private arrows: ArrowSprite[] = [];
  private galleryItemSlots = new Map<string, string>();
  private callbacks!: EntityCallbacks;
  private pendingRespawns: { col: number; row: number; ms: number }[] = [];

  constructor() { super('GalleryScene'); }

  preload() {
    if (!this.textures.exists('character_body'))
      this.load.image('character_body', 'assets/sprites/characters/character_body.png');
    if (!this.textures.exists('character_hand'))
      this.load.image('character_hand', 'assets/sprites/characters/character_hand.png');
  }

  create() {
    // Gallery uses a fixed tile size so it looks identical to the game
    const ts = GALLERY_TS;
    this.mapOffsetX = Math.max(0, Math.floor((CANVAS_W - ts * MAP_W) / 2));
    this.mapTopY    = Math.max(0, Math.floor((CANVAS_H - ts * MAP_H) / 2));
    setTileSize(ts);
    setTileOffsetX(this.mapOffsetX);

    // Build map
    const tiles: number[][] = [];
    const blockHp: number[][] = [];
    for (let r = 0; r < MAP_H; r++) {
      tiles.push([]);
      blockHp.push([]);
      for (let c = 0; c < MAP_W; c++) {
        const isBorder = r === 0 || r === MAP_H - 1 || c === 0 || c === MAP_W - 1;
        tiles[r].push(isBorder ? T_SOLID : T_FLOOR);
        blockHp[r].push(0);
      }
    }
    this.map = {
      width: MAP_W, height: MAP_H, tiles, blockHp,
      spawns: [{ col: PLAYER_START_COL, row: PLAYER_START_ROW }],
    };

    this.__floorItems = new Map();
    this.__dirtyTiles = new Set();

    // Background — fixed to camera so it always covers the viewport
    ensureCamoTextures(this);
    this.add.tileSprite(0, 0, CANVAS_W, CANVAS_H, 'camo_bg').setOrigin(0).setDepth(-1).setScrollFactor(0);

    this.tileGraphics = this.add.graphics().setDepth(0);
    this.drawAllTiles();

    this.callbacks = this.makeCallbacks();

    // Player at right end of centre aisle
    this.player = new Player(this, PLAYER_START_COL, PLAYER_START_ROW, this.mapTopY, this.callbacks);

    // Dummies — tan, normal HP, show health bar
    for (const pos of DUMMY_POSITIONS) {
      this.spawnDummy(pos.col, pos.row);
    }

    // Floor items
    for (const slot of ITEM_SLOTS) {
      this.spawnGalleryItem(slot.col, slot.row, slot.item);
    }

    // ESC → menu
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .on('down', () => this.scene.start('MenuScene'));
  }

  update(_time: number, delta: number) {
    this.player.update(delta, this.map);
    for (const d of this.dummies) d.update(delta, this.map);
    this.updateArrows(delta);

    // Dummy respawn timers
    for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
      const r = this.pendingRespawns[i];
      r.ms -= delta;
      if (r.ms <= 0) {
        this.spawnDummy(r.col, r.row);
        this.pendingRespawns.splice(i, 1);
      }
    }

    // Item respawn
    for (const [key, item] of this.galleryItemSlots) {
      if (!this.__floorItems.has(key)) {
        const [col, row] = key.split(',').map(Number);
        if (this.player.col !== col || this.player.row !== row) {
          this.spawnGalleryItem(col, row, item);
        }
      }
    }

    // Camera follows the body's visual position (tracks the movement tween exactly)
    const maxScrollX = Math.max(0, MAP_W * TILE_SIZE - CANVAS_W);
    const maxScrollY = Math.max(0, MAP_H * TILE_SIZE - CANVAS_H);
    this.cameras.main.scrollX = Phaser.Math.Clamp(this.player.body.x - CANVAS_W / 2, 0, maxScrollX);
    this.cameras.main.scrollY = Phaser.Math.Clamp(this.player.body.y - CANVAS_H / 2, 0, maxScrollY);
  }

  // ── Dummy spawn / respawn ────────────────────────────────────────────────

  private spawnDummy(col: number, row: number) {
    const dummy = new Entity(this, `dummy_${col}_${row}`, 'tan', col, row, this.mapTopY, this.callbacks);
    dummy.forceIdleHands = true;
    this.dummies.push(dummy);
  }

  // ── Floating damage numbers ──────────────────────────────────────────────

  private showDamageNumber(bx: number, by: number, damage: number) {
    const t = Math.min(1, damage / 75);
    const g = Math.floor(255 * (1 - t));
    const color = `#ff${g.toString(16).padStart(2, '0')}00`;
    const fontSize = Math.max(12, Math.round(12 + damage * 0.2));
    const offX = (Math.random() - 0.5) * TILE_SIZE * 0.5;

    const txt = this.add.text(bx + offX, by - TILE_SIZE * 0.4, String(damage), {
      fontFamily: '"Press Start 2P"', fontSize: `${fontSize}px`, color,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(50);

    this.tweens.add({
      targets: txt,
      x: txt.x + (Math.random() - 0.5) * TILE_SIZE * 0.5,
      y: by - TILE_SIZE * 1.4,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ── Floor item management ────────────────────────────────────────────────

  private spawnGalleryItem(col: number, row: number, item: string) {
    const key = `${col},${row}`;
    if (this.__floorItems.has(key)) return;

    const { x, y } = this.tileToWorld(col, row);
    const color = ITEM_COLORS[item] ?? 0xffffff;
    const bg = this.add.circle(x, y, TILE_SIZE * 0.28, color, 0.9).setDepth(5);
    bg.setStrokeStyle(2, 0x000000);
    const label = this.add.text(x, y, item[0].toUpperCase(), {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#000000',
    }).setOrigin(0.5).setDepth(6);

    this.tweens.add({
      targets: [bg, label], y: `-=4`, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.__floorItems.set(key, { col, row, item, objects: [bg, label] });
    this.galleryItemSlots.set(key, item);
  }

  // ── Projectile system ────────────────────────────────────────────────────

  private spawnArrow(col: number, row: number, dir: Direction, damage: number, ownerId: string, isRpg: boolean) {
    const { x, y } = this.tileToWorld(col, row);
    const isH = dir === 'left' || dir === 'right';
    const color = isRpg ? 0xff6622 : 0xcc8844;
    const w = isH ? (isRpg ? 28 : 20) : (isRpg ? 10 : 5);
    const h = isH ? (isRpg ? 10 : 5) : (isRpg ? 28 : 20);
    const rect = this.add.rectangle(x, y, w, h, color).setDepth(14);
    this.arrows.push({ col, row, dir, damage, ownerId, isRpg, x, y, rect, dead: false, tilesMoved: 0 });
  }

  private updateArrows(delta: number) {
    const dt = delta / 1000;
    for (const arrow of this.arrows) {
      if (arrow.dead) continue;
      const speed = (arrow.isRpg ? RPG_SPEED : BOW_ARROW_SPEED) * TILE_SIZE;
      const d = DIR_DELTA[arrow.dir];
      arrow.x += d.dc * speed * dt;
      arrow.y += d.dr * speed * dt;
      arrow.rect.setPosition(arrow.x, arrow.y);

      const tileCol = Math.floor((arrow.x - TILE_OFFSET_X) / TILE_SIZE);
      const tileRow = Math.floor((arrow.y - this.mapTopY) / TILE_SIZE);
      const tile = this.map.tiles[tileRow]?.[tileCol];

      const tilesFromOrigin = Math.abs(tileCol - arrow.col) + Math.abs(tileRow - arrow.row);
      const outOfRange = arrow.isRpg && tilesFromOrigin > 6.5;
      const isBlocker = (t: number | undefined) => t === undefined || t === T_SOLID || t === T_BLOCK || t === T_CRATE;
      const hitObstacle = isBlocker(tile);

      if (hitObstacle || outOfRange) {
        const stopCol = hitObstacle ? tileCol - d.dc : tileCol;
        const stopRow = hitObstacle ? tileRow - d.dr : tileRow;
        if (arrow.isRpg) this.rpgExplode(stopCol, stopRow, arrow);
        arrow.dead = true;
        arrow.rect.destroy();
        continue;
      }

      // Entity collision — bow stops at first dummy; RPG explodes on contact
      const hit = this.dummies.find(e => e.alive && e.col === tileCol && e.row === tileRow);
      if (hit) {
        if (arrow.isRpg) {
          this.rpgExplode(tileCol, tileRow, arrow);
        } else {
          const shooter = (this.player.id === arrow.ownerId ? this.player : null)
            ?? this.dummies.find(e => e.id === arrow.ownerId)
            ?? this.player;
          shooter.dealDamage(hit, arrow.damage);
        }
        arrow.dead = true;
        arrow.rect.destroy();
        continue;
      }
    }
    this.arrows = this.arrows.filter(a => !a.dead);
  }

  private rpgExplode(epicCol: number, epicRow: number, arrow: ArrowSprite) {
    const { x, y } = this.tileToWorld(epicCol, epicRow);
    const circle = this.add.circle(x, y, TILE_SIZE * 0.7, 0xff4400, 0.8).setDepth(30);
    this.tweens.add({
      targets: circle, alpha: 0, scaleX: 2, scaleY: 2, duration: 300, ease: 'Power2',
      onComplete: () => circle.destroy(),
    });

    const shooter = (this.player.id === arrow.ownerId ? this.player : null)
      ?? this.dummies.find(e => e.id === arrow.ownerId)
      ?? this.player;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const isDirect = dr === 0 && dc === 0;
        for (const e of this.dummies) {
          if (e.alive && e.col === epicCol + dc && e.row === epicRow + dr) {
            shooter.dealDamage(e, isDirect ? arrow.damage : RPG_AOE_DAMAGE);
          }
        }
      }
    }
  }

  // ── Callbacks ────────────────────────────────────────────────────────────

  private makeCallbacks(): EntityCallbacks {
    return {
      onDamage: (_source, target, amount) => {
        // Show floating damage number at the target's current visual position
        this.showDamageNumber(target.body.x, target.body.y, amount);
      },
      onDeath: (entity) => {
        if (this.dummies.includes(entity)) {
          const col = entity.col;
          const row = entity.row;
          this.dummies = this.dummies.filter(d => d !== entity);
          // Schedule respawn
          this.pendingRespawns.push({ col, row, ms: DUMMY_RESPAWN_MS });
        }
      },
      onPickup: (_entity, _item) => {},
      onBlockBreak: (_entity) => {},
      onShotFired: (_entity) => {},
      getAllEntities: () => [this.player, ...this.dummies],
      getMap: () => this.map,
      getProjectiles: () => this.arrows
        .filter(a => !a.dead)
        .map(a => ({
          col: Math.floor((a.x - TILE_OFFSET_X) / TILE_SIZE),
          row: Math.floor((a.y - this.mapTopY) / TILE_SIZE),
          dir: a.dir,
          ownerId: a.ownerId,
        })),
      spawnFloorItem: (col, row, item) => this.spawnGalleryItem(col, row, item),
      spawnArrow: (col, row, dir, damage, ownerId, isRpg) =>
        this.spawnArrow(col, row, dir, damage, ownerId, isRpg),
    };
  }

  // ── Tile rendering ───────────────────────────────────────────────────────

  private drawAllTiles() {
    this.tileGraphics.clear();
    for (let r = 0; r < MAP_H; r++) {
      for (let c = 0; c < MAP_W; c++) {
        this.drawTile(c, r);
      }
    }
  }

  private drawTile(col: number, row: number) {
    const t = this.map.tiles[row]?.[col];
    if (t === undefined) return;
    const x = col * TILE_SIZE + this.mapOffsetX;
    const y = row * TILE_SIZE + this.mapTopY;
    const color = t === T_SOLID ? 0x707070 : 0x2a2a2a;
    this.tileGraphics.fillStyle(color);
    this.tileGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    this.tileGraphics.lineStyle(1, 0x000000, 0.5);
    this.tileGraphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2 + this.mapOffsetX,
      y: row * TILE_SIZE + TILE_SIZE / 2 + this.mapTopY,
    };
  }
}
