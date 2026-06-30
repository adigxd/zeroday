import Phaser from 'phaser';
import { TILE_SIZE, TILE_OFFSET_X, SCORE_BAR_HEIGHT, PLAYER_COLORS, PLAYER_COLOR_NAMES, BOW_ARROW_SPEED, RPG_SPEED, RPG_AOE_MULT, CANVAS_W, CANVAS_H, setTileSize, setTileOffsetX } from '../config/GameConfig';
import { loadTheme, getColors } from '../config/Theme';
import { getRandomMap, MapData, T_FLOOR, T_HOLE, T_SOLID, T_BLOCK, T_CRATE } from '../systems/MapManager';
import { Player } from '../entities/Player';
import { AIPlayer } from '../ai/AIStateMachine';
import { Entity, Direction, EntityCallbacks } from '../entities/Entity';
import { ScoreManager } from '../systems/ScoreManager';
import { StatsTracker } from '../systems/StatsTracker';
import { loadDifficulty } from './SettingsScene';
import { rollDrop } from '../systems/DropSystem';
import { loadBindings } from '../config/DefaultBindings';

const TILE_COLORS: Record<number, number> = {
  [T_FLOOR]: 0x2a2a2a,
  [T_HOLE]:  0x0a0a0a, // near-black pit
  [T_BLOCK]: 0x5c4a3a,
  [T_CRATE]: 0x8b6914,
  [T_SOLID]: 0x707070, // gray indestructible wall
};

interface FloorItemEntry {
  col: number;
  row: number;
  item: string;
  objects: Phaser.GameObjects.GameObject[];
}

interface ArrowSprite {
  col: number;
  row: number;
  dir: Direction;
  damage: number;
  ownerId: string;
  isRpg: boolean;
  x: number;
  y: number;
  rect: Phaser.GameObjects.Rectangle;
  dead: boolean;
  tilesMoved: number;
}

const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up:    { dr: -1, dc: 0 },
  down:  { dr:  1, dc: 0 },
  left:  { dr:  0, dc: -1 },
  right: { dr:  0, dc:  1 },
};

export class GameScene extends Phaser.Scene {
  // Exposed to Entity via (scene as any)
  __floorItems!: Map<string, FloorItemEntry>;
  __dirtyTiles!: Set<string>;

  private map!: MapData;
  private mapOffsetX = 0;  // horizontal centering offset (px)
  private mapTopY    = SCORE_BAR_HEIGHT; // top of game area in canvas px
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private scoreBar!: Phaser.GameObjects.Graphics;
  private scoreTexts:     Phaser.GameObjects.Text[]  = [];
  private scorePortraits: Phaser.GameObjects.Image[] = [];
  private player!: Player;
  private ais: AIPlayer[] = [];
  private entities: Entity[] = [];
  private scoreManager!: ScoreManager;
  private statsTracker!: StatsTracker;
  private arrows: ArrowSprite[] = [];
  private playerCount = 2;
  private roundNumber = 1;
  private gameActive = false;
  private escKey!: Phaser.Input.Keyboard.Key;
  private testMode = false;

  constructor() { super('GameScene'); }

  init(data: { playerCount: number; roundNumber: number; scoreManager?: ScoreManager; testMode?: boolean }) {
    this.playerCount = data.playerCount ?? 2;
    this.roundNumber = data.roundNumber ?? 1;
    this.scoreManager = data.scoreManager ?? new ScoreManager();
    this.statsTracker = new StatsTracker();
    this.testMode = data.testMode ?? false;
  }

  preload() {
    this.load.image('character_body', 'assets/sprites/characters/character_body.png');
    this.load.image('character_hand', 'assets/sprites/characters/character_hand.png');
  }

  create() {
    const C = getColors(loadTheme());
    this.map = getRandomMap(this.playerCount);

    // Tile size: fit the smaller dimension, center the other
    const gameAreaH = CANVAS_H - SCORE_BAR_HEIGHT;
    const ts = Math.min(
      Math.floor(CANVAS_W     / this.map.width),
      Math.floor(gameAreaH    / this.map.height),
    );
    this.mapOffsetX = Math.floor((CANVAS_W  - ts * this.map.width)  / 2);
    this.mapTopY    = SCORE_BAR_HEIGHT + Math.floor((gameAreaH - ts * this.map.height) / 2);
    setTileSize(ts);
    setTileOffsetX(this.mapOffsetX);

    void C; // theme used below in UI elements

    // Clear all carry-over state from previous round
    this.ais      = [];
    this.arrows   = [];
    this.entities = [];
    this.scoreTexts = [];
    this.scorePortraits = [];

    this.__floorItems = new Map();
    this.__dirtyTiles = new Set();
    (this as any).__dirtyTiles = this.__dirtyTiles;

    this.tileGraphics = this.add.graphics().setDepth(0);
    this.drawAllTiles();

    this.buildEntities();
    this.buildScoreBar();

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Re-enable game loop when PauseScene resumes us
    this.events.on('resume', () => { this.gameActive = true; });

    if (this.testMode) {
      this.startTestRound();
    } else {
      this.startCountdown();
    }
  }

  private buildEntities() {
    const difficulty = loadDifficulty();
    const callbacks = this.makeCallbacks();
    const spawns = this.map.spawns;

    // Register scores
    this.scoreManager.register('player', 'white');
    for (let i = 1; i < this.playerCount; i++) {
      this.scoreManager.register(`ai_${i}`, PLAYER_COLOR_NAMES[i]);
    }

    const s0 = spawns[0];
    this.player = new Player(this, s0.col, s0.row, this.mapTopY, callbacks);
    this.entities = [this.player];

    for (let i = 1; i < this.playerCount; i++) {
      const sp = spawns[i] ?? spawns[0];
      const ai = new AIPlayer(this, `ai_${i}`, PLAYER_COLOR_NAMES[i], sp.col, sp.row, this.mapTopY, difficulty, callbacks);
      this.ais.push(ai);
      this.entities.push(ai);
    }
  }

  private makeCallbacks(): EntityCallbacks {
    return {
      onDamage: (source, _target, amount) => {
        this.scoreManager.addDamage(source.id, amount);
      },
      onDeath: (entity) => {
        if (entity.id === 'player') {
          this.statsTracker.increment('deaths');
          this.showSkipRoundButton();
        } else {
          this.statsTracker.increment('kills');
        }
        this.time.delayedCall(0, () => this.checkRoundEnd());
      },
      onPickup: (entity, item) => {
        if (entity.id === 'player') this.statsTracker.increment('itempickups');
        void item;
      },
      onBlockBreak: (entity) => {
        if (entity.id === 'player') this.statsTracker.increment('blocksbroken');
        this.redrawDirtyTiles();
      },
      onShotFired: (entity) => {
        if (entity.id === 'player') this.statsTracker.increment('shotsfired');
      },
      getAllEntities: () => this.entities,
      getMap: () => this.map,
      getProjectiles: () => this.arrows
        .filter(a => !a.dead)
        .map(a => ({
          col: Math.floor((a.x - TILE_OFFSET_X) / TILE_SIZE),
          row: Math.floor((a.y - this.mapTopY) / TILE_SIZE),
          dir: a.dir,
          ownerId: a.ownerId,
        })),
      spawnFloorItem: (col, row, item) => this.spawnFloorItem(col, row, item),
      spawnArrow: (col, row, dir, damage, ownerId, isRpg) => this.spawnArrow(col, row, dir, damage, ownerId, isRpg),
    };
  }

  private buildScoreBar() {
    const C = getColors(loadTheme());
    const { width } = this.scale;
    const scores = this.scoreManager.getAll();
    const slotW = width / scores.length;

    // Static background
    this.add.rectangle(0, 0, width, SCORE_BAR_HEIGHT, C.bgHex).setOrigin(0).setDepth(50);
    this.scoreBar = this.add.graphics().setDepth(51); // kept for compatibility

    scores.forEach((s, i) => {
      const cx = slotW * i + slotW / 2;
      const cy = SCORE_BAR_HEIGHT / 2 - 4;
      const color = PLAYER_COLORS[s.colorName] ?? 0xffffff;

      // Character body sprite portrait
      const portrait = this.add.image(cx, cy, 'character_body')
        .setDisplaySize(30, 30)
        .setDepth(52);
      if (s.colorName !== 'white') portrait.setTint(color);
      this.scorePortraits.push(portrait);

      // Score counter below portrait
      const t = this.add.text(cx, SCORE_BAR_HEIGHT - 6, '0', {
        fontFamily: '"Press Start 2P"', fontSize: '10px', color: C.text,
      }).setOrigin(0.5, 1).setDepth(52);
      this.scoreTexts.push(t);
    });

    this.drawScoreBar();
  }

  private drawScoreBar() {
    const scores = this.scoreManager.getAll();
    scores.forEach((s, i) => {
      this.scoreTexts[i]?.setText(String(s.roundPoints));
    });
  }

  private startCountdown() {
    this.gameActive = false;
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;

    const show = () => {
      const t = this.add.text(cx, cy, steps[i], {
        fontFamily: '"Press Start 2P"',
        fontSize: i < 3 ? '80px' : '60px',
        color: i < 3 ? '#1a1a1a' : '#cc6600',
        stroke: '#f0ede6',
        strokeThickness: 6,
      }).setOrigin(0.5).setDepth(100).setAlpha(0);

      this.tweens.add({
        targets: t,
        alpha: 1,
        scaleX: { from: 0.5, to: 1 },
        scaleY: { from: 0.5, to: 1 },
        duration: 200,
        onComplete: () => {
          this.time.delayedCall(600, () => {
            this.tweens.add({ targets: t, alpha: 0, duration: 200, onComplete: () => t.destroy() });
            i++;
            if (i < steps.length) show();
            else {
              this.gameActive = true;
              this.input.keyboard!.on('keydown-ESC', this.onEsc, this);
            }
          });
        },
      });
    };

    show();
  }

  private startTestRound() {
    const ROUND_MS = 20_000;
    let aiMoves = 0;

    // Count successful moves by wrapping moveTo on each AI instance
    this.ais.forEach(ai => {
      const origMoveTo = ai.moveTo.bind(ai);
      ai.moveTo = (dir: any, map: any): boolean => {
        const r: boolean = origMoveTo(dir, map);
        if (r) aiMoves++;
        return r;
      };
    });

    this.gameActive = true;

    this.time.delayedCall(ROUND_MS, () => {
      this.gameActive = false;
      const payload = {
        aiMoves,
        mapW: this.map.width,
        mapH: this.map.height,
        roundNumber: this.roundNumber,
      };
      this.game.events.emit('test-round-complete', payload);

      // Restart into the next round after a short pause so Phaser can settle
      this.time.delayedCall(300, () => {
        this.scene.restart({
          playerCount: this.playerCount,
          roundNumber: this.roundNumber + 1,
          testMode: true,
        });
      });
    });
  }

  private onEsc() {
    if (!this.gameActive) return;
    this.gameActive = false;
    this.scene.pause();
    this.scene.launch('PauseScene');
    this.scene.bringToTop('PauseScene');
  }

  update(_time: number, delta: number) {
    if (!this.gameActive) return;

    if (!this.testMode) this.player.update(delta, this.map);
    this.ais.forEach(ai => { if (ai.alive) ai.update(delta, this.map); });
    this.updateArrows(delta);
    this.redrawDirtyTiles();
  }

  private redrawDirtyTiles() {
    if (this.__dirtyTiles.size === 0) return;
    this.__dirtyTiles.forEach(key => {
      const [c, r] = key.split(',').map(Number);
      this.drawTile(c, r);
    });
    this.__dirtyTiles.clear();
  }

  private drawAllTiles() {
    this.tileGraphics.clear();
    // Fill void outside the map with the hole color
    this.tileGraphics.fillStyle(0x0a0a0a);
    this.tileGraphics.fillRect(0, SCORE_BAR_HEIGHT, CANVAS_W, CANVAS_H - SCORE_BAR_HEIGHT);
    for (let r = 0; r < this.map.height; r++) {
      for (let c = 0; c < this.map.width; c++) {
        this.drawTile(c, r);
      }
    }
  }

  private drawTile(col: number, row: number) {
    const t = this.map.tiles[row]?.[col];
    if (t === undefined) return;
    const x = col * TILE_SIZE + this.mapOffsetX;
    const y = row * TILE_SIZE + this.mapTopY;

    // Base color
    let color = TILE_COLORS[t] ?? 0x2a2a2a;

    // Crack stages for blocks
    if (t === T_BLOCK) {
      const hp = this.map.blockHp[row][col];
      if      (hp === 2) color = 0x4a3a2a;
      else if (hp === 1) color = 0x3a2a1a;
    } else if (t === T_CRATE) {
      const hp = this.map.blockHp[row][col];
      if (hp === 1) color = 0x6b4f0e;
    }

    this.tileGraphics.fillStyle(color);
    this.tileGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Grid border
    this.tileGraphics.lineStyle(1, 0x000000, 0.5);
    this.tileGraphics.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    // Crate wood slats
    if (t === T_CRATE) {
      this.tileGraphics.lineStyle(1, 0x5a3a08, 0.8);
      this.tileGraphics.beginPath();
      this.tileGraphics.moveTo(x + TILE_SIZE * 0.3, y + 2);
      this.tileGraphics.lineTo(x + TILE_SIZE * 0.3, y + TILE_SIZE - 2);
      this.tileGraphics.moveTo(x + TILE_SIZE * 0.7, y + 2);
      this.tileGraphics.lineTo(x + TILE_SIZE * 0.7, y + TILE_SIZE - 2);
      this.tileGraphics.moveTo(x + 2, y + TILE_SIZE / 2);
      this.tileGraphics.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE / 2);
      this.tileGraphics.strokePath();
    }
  }

  private spawnFloorItem(col: number, row: number, item: string) {
    const x = col * TILE_SIZE + TILE_SIZE / 2 + this.mapOffsetX;
    const y = row * TILE_SIZE + TILE_SIZE / 2 + this.mapTopY;
    const key = `${col},${row}`;

    const itemColors: Record<string, number> = {
      knife: 0xcccccc, mace: 0x888888, sword: 0xaaccff,
      pistol: 0xffcc44, rifle: 0x44ccff, sniper: 0xff8844,
      laser: 0x44ff44, bow: 0xcc8844, rpg: 0xff6622,
      medkit: 0xff4444, shield: 0x4488ff,
    };

    const color = itemColors[item] ?? 0xffffff;
    const bg = this.add.circle(x, y, TILE_SIZE * 0.28, color, 0.9).setDepth(5);
    bg.setStrokeStyle(2, 0x000000);

    const label = this.add.text(x, y, item[0].toUpperCase(), {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#000000',
    }).setOrigin(0.5).setDepth(6);

    // Float bob
    this.tweens.add({
      targets: [bg, label],
      y: `-=4`,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.__floorItems.set(key, { col, row, item, objects: [bg, label] });
  }

  private spawnArrow(col: number, row: number, dir: Direction, damage: number, ownerId: string, isRpg: boolean) {
    const x = col * TILE_SIZE + TILE_SIZE / 2 + this.mapOffsetX;
    const y = row * TILE_SIZE + TILE_SIZE / 2 + this.mapTopY;
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

      // Check range for RPG
      const tilesFromOrigin = Math.abs(tileCol - arrow.col) + Math.abs(tileRow - arrow.row);
      const outOfRange = arrow.isRpg && tilesFromOrigin > (6 + 0.5);

      const hitObstacle = tile === undefined || tile === T_SOLID || tile === T_BLOCK || tile === T_CRATE;

      if (hitObstacle || outOfRange) {
        if (arrow.isRpg) this.rpgExplode(tileCol, tileRow, arrow);
        arrow.dead = true;
        arrow.rect.destroy();
        continue;
      }

      // Entity hit
      const hit = this.entities.find(e => e.alive && e.col === tileCol && e.row === tileRow
        && (arrow.isRpg ? true : e.id !== arrow.ownerId)); // RPG can hit shooter via AoE, not direct
      if (hit && !arrow.isRpg) {
        const shooter = this.entities.find(e => e.id === arrow.ownerId);
        if (shooter) shooter.dealDamage(hit, arrow.damage);
        arrow.dead = true;
        arrow.rect.destroy();
      } else if (hit && arrow.isRpg && hit.id !== arrow.ownerId) {
        // Direct RPG hit — explode
        if (arrow.isRpg) this.rpgExplode(tileCol, tileRow, arrow);
        arrow.dead = true;
        arrow.rect.destroy();
      }
    }

    this.arrows = this.arrows.filter(a => !a.dead);
  }

  private rpgExplode(epicolCol: number, epicRow: number, arrow: ArrowSprite) {
    const shooter = this.entities.find(e => e.id === arrow.ownerId);
    const aoeDamage = Math.floor(arrow.damage * RPG_AOE_MULT);
    const { x: ex, y: ey } = this.tileToWorld(epicolCol, epicRow);

    // Visual explosion
    const circle = this.add.circle(ex, ey, TILE_SIZE * 0.7, 0xff4400, 0.8).setDepth(30);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      ease: 'Power2',
      onComplete: () => circle.destroy(),
    });

    // Damage & break blocks in 8 surrounding tiles + center
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const tc = epicolCol + dc;
        const tr = epicRow + dr;
        const t = this.map.tiles[tr]?.[tc];

        if (t === T_BLOCK || t === T_CRATE) {
          const wasCrate = t === T_CRATE;
          this.map.tiles[tr][tc] = T_FLOOR;
          this.map.blockHp[tr][tc] = 0;
          this.__dirtyTiles.add(`${tc},${tr}`);
          if (wasCrate) {
            const drop = rollDrop();
            if (drop !== 'nothing') this.spawnFloorItem(tc, tr, drop);
          }
        }

        // AoE damage to all entities (including shooter — friendly fire)
        for (const e of this.entities) {
          if (e.alive && e.col === tc && e.row === tr) {
            if (shooter) shooter.dealDamage(e, aoeDamage);
          }
        }
      }
    }

    this.redrawDirtyTiles();
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2 + this.mapOffsetX, y: row * TILE_SIZE + TILE_SIZE / 2 + this.mapTopY };
  }

  private skipBg?: Phaser.GameObjects.Rectangle;
  private skipText?: Phaser.GameObjects.Text;

  private showSkipRoundButton() {
    const aliveCount = this.entities.filter(e => e.alive).length;
    if (aliveCount <= 1) return;

    const { width, height } = this.scale;
    const x = width / 2, y = height - 60;

    const C = getColors(loadTheme());
    this.skipBg = this.add.rectangle(x, y, 230, 46, C.btnBg, 0.95).setStrokeStyle(2, C.btnStroke).setDepth(150).setInteractive({ useHandCursor: true });
    this.skipText = this.add.text(x, y, 'SKIP ROUND →', { fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.btnText }).setOrigin(0.5).setDepth(151);

    this.skipBg.on('pointerover', () => { this.skipBg?.setFillStyle(C.btnHover); });
    this.skipBg.on('pointerout',  () => { this.skipBg?.setFillStyle(C.btnBg); });
    this.skipBg.on('pointerdown', () => {
      if (!this.gameActive) return;
      this.gameActive = false;

      // Find the top-damaging AI; if tied or no damage, pick a random AI
      const aiScores = this.scoreManager.getAll().filter(s => s.id !== 'player');
      const maxDmg   = Math.max(...aiScores.map(s => s.roundDamage));
      const pool     = maxDmg > 0
        ? aiScores.filter(s => s.roundDamage === maxDmg)
        : aiScores;
      const winner   = pool.length > 0
        ? this.entities.find(e => e.id === pool[Math.floor(Math.random() * pool.length)].id) ?? null
        : null;

      if (winner) this.scoreManager.addRoundPoint(winner.id);
      this.drawScoreBar();
      this.destroySkipButton();
      this.showRoundEnd(winner);
    });
  }

  private destroySkipButton() {
    this.skipBg?.destroy();
    this.skipText?.destroy();
    this.skipBg = undefined;
    this.skipText = undefined;
  }

  private checkRoundEnd() {
    if (!this.gameActive) return;
    const alive = this.entities.filter(e => e.alive);
    if (alive.length > 1) return;

    this.gameActive = false;
    this.destroySkipButton();
    const winner = alive[0] ?? null;
    if (winner) this.scoreManager.addRoundPoint(winner.id);
    this.drawScoreBar();

    this.time.delayedCall(600, () => this.showRoundEnd(winner));
  }

  private showRoundEnd(winner: Entity | null) {
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;
    const C = getColors(loadTheme());

    const panel = this.add.rectangle(cx, cy, 460, 300, C.bgHex, 0.97).setDepth(200);
    panel.setStrokeStyle(3, C.btnStroke);

    const winText = winner
      ? (winner.id === 'player' ? 'YOU WIN!' : `${winner.colorName.toUpperCase()} WINS!`)
      : 'DRAW!';
    const hexColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
    const winColor = winner ? hexColor(PLAYER_COLORS[winner.colorName] ?? 0x111111) : C.text;

    this.add.text(cx, cy - 95, winText, {
      fontFamily: '"Press Start 2P"', fontSize: '26px', color: winColor,
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(201);

    const top = this.scoreManager.topDamageDealer();
    if (top) {
      const topColor = hexColor(PLAYER_COLORS[top.colorName] ?? 0x111111);
      this.add.text(cx, cy - 35, `Top damage: ${top.colorName}`, {
        fontFamily: '"Press Start 2P"', fontSize: '13px', color: topColor,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(201);
      this.add.text(cx, cy - 10, `${top.roundDamage} dmg dealt`, {
        fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.subtext,
      }).setOrigin(0.5).setDepth(201);
    }

    const doNextRound = () => {
      this.scoreManager.resetRoundDamage();
      this.scene.restart({ playerCount: this.playerCount, roundNumber: this.roundNumber + 1, scoreManager: this.scoreManager });
    };
    const doMenu = () => this.scene.start('MenuScene');

    this.makeOverlayButton(cx - 90, cy + 70, 'NEXT ROUND', C, doNextRound);
    this.makeOverlayButton(cx + 90, cy + 70, 'MENU', C, doMenu);

    // Keyboard shortcuts on the round-end panel
    const attackBinding = loadBindings().attack;
    const attackKey = this.input.keyboard!.addKey(
      (Phaser.Input.Keyboard.KeyCodes as any)[attackBinding] ?? attackBinding
    );
    this.input.keyboard!.once('keydown-ESC', doMenu);
    attackKey.once('down', doNextRound);
  }

  private makeOverlayButton(x: number, y: number, label: string, C: ReturnType<typeof getColors>, cb: () => void) {
    const bw = 155, bh = 44;
    const bg = this.add.rectangle(x, y, bw, bh, C.btnBg).setStrokeStyle(2, C.btnStroke).setDepth(202).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.btnText }).setOrigin(0.5).setDepth(203);
    bg.on('pointerover', () => bg.setFillStyle(C.btnHover));
    bg.on('pointerout',  () => bg.setFillStyle(C.btnBg));
    bg.on('pointerdown', cb);
    void t;
  }
}
