import Phaser from 'phaser';
import { Entity, EntityCallbacks, Direction } from './Entity';
import { PLAYER_MOVE_DURATION, BLOCK_HIT_COOLDOWN } from '../config/GameConfig';
import { T_BLOCK, T_CRATE, MapData } from '../systems/MapManager';
import { loadBindings } from '../config/DefaultBindings';
import { loadAttackMode, AttackMode } from '../scenes/SettingsScene';
import { rollDrop } from '../systems/DropSystem';

export class Player extends Entity {
  protected moveDuration = PLAYER_MOVE_DURATION; // 4× faster than AI
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastBreakKey: 'break1' | 'break2' | null = null;
  private blockCooldown = 0;
  private moveCooldown = 0;
  private bufferedDir: Direction | null = null;
  private bindings    = loadBindings();
  private attackMode: AttackMode = loadAttackMode();

  constructor(scene: Phaser.Scene, col: number, row: number, offsetY: number, callbacks: EntityCallbacks) {
    super(scene, 'player', 'white', col, row, offsetY, callbacks);
    this.setupInput();
  }

  private bindingToKey(code: string): Phaser.Input.Keyboard.Key {
    const kb = this.scene.input.keyboard!;
    const kc = (Phaser.Input.Keyboard.KeyCodes as any)[code];
    return kb.addKey(kc ?? code);
  }

  private setupInput() {
    this.keys = {
      up:     this.bindingToKey(this.bindings.up),
      down:   this.bindingToKey(this.bindings.down),
      left:   this.bindingToKey(this.bindings.left),
      right:  this.bindingToKey(this.bindings.right),
      break1: this.bindingToKey(this.bindings.break1),
      break2: this.bindingToKey(this.bindings.break2),
      attack: this.bindingToKey(this.bindings.attack),
    };
  }

  update(delta: number, map: MapData) {
    if (!this.alive) return;
    super.update(delta, map);

    this.moveCooldown  = Math.max(0, this.moveCooldown  - delta);
    this.blockCooldown = Math.max(0, this.blockCooldown - delta);

    // Buffer movement presses — JustDown ensures one press = one tile
    if (Phaser.Input.Keyboard.JustDown(this.keys.up))         this.bufferedDir = 'up';
    else if (Phaser.Input.Keyboard.JustDown(this.keys.down))  this.bufferedDir = 'down';
    else if (Phaser.Input.Keyboard.JustDown(this.keys.left))  this.bufferedDir = 'left';
    else if (Phaser.Input.Keyboard.JustDown(this.keys.right)) this.bufferedDir = 'right';

    if (this.moveCooldown <= 0 && !this.isMoving() && this.bufferedDir) {
      this.moveTo(this.bufferedDir, map);
      this.bufferedDir = null;
      this.moveCooldown = PLAYER_MOVE_DURATION;
    }

    // Block breaking — either break key works independently; alternating between
    // break1 and break2 also works for players who prefer that rhythm
    if (this.blockCooldown <= 0) {
      const b1 = this.keys.break1.isDown;
      const b2 = this.keys.break2.isDown;

      if (b1 && this.lastBreakKey !== 'break1') {
        this.lastBreakKey = 'break1';
        this.tryBreakBlock(map);
        this.blockCooldown = BLOCK_HIT_COOLDOWN;
      } else if (b2 && this.lastBreakKey !== 'break2') {
        this.lastBreakKey = 'break2';
        this.tryBreakBlock(map);
        this.blockCooldown = BLOCK_HIT_COOLDOWN;
      } else if (!b1 && !b2) {
        this.lastBreakKey = null; // reset so holding one key fires continuously
      }
    }

    // Attack — held: auto-fires at weapon cooldown rate; tap: one press = one shot
    const attackPressed = this.attackMode === 'tap'
      ? Phaser.Input.Keyboard.JustDown(this.keys.attack)
      : this.keys.attack.isDown;
    if (attackPressed) this.attack(map);
  }

  private tryBreakBlock(map: MapData) {
    const deltas: Record<Direction, { dr: number; dc: number }> = {
      up:    { dr: -1, dc: 0 },
      down:  { dr:  1, dc: 0 },
      left:  { dr:  0, dc: -1 },
      right: { dr:  0, dc:  1 },
    };
    const d = deltas[this.facing];
    const tc = this.col + d.dc;
    const tr = this.row + d.dr;
    const tile = map.tiles[tr]?.[tc];
    if (tile !== T_BLOCK && tile !== T_CRATE) return;

    const hp = map.blockHp[tr]?.[tc];
    if (!hp || hp <= 0) return;

    map.blockHp[tr][tc]--;
    if (map.blockHp[tr][tc] <= 0) {
      const wasCrate = map.tiles[tr][tc] === T_CRATE;
      map.tiles[tr][tc] = 0;
      map.blockHp[tr][tc] = 0;
      this.callbacks.onBlockBreak(this);
      if (wasCrate) {
        const drop = rollDrop();
        if (drop !== 'nothing') {
          this.callbacks.spawnFloorItem(tc, tr, drop);
        }
      }
    }
    (this.scene as any).__dirtyTiles?.add(`${tc},${tr}`);
  }
}
