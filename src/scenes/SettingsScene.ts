import Phaser from 'phaser';
import { loadBindings, saveBindings, DEFAULT_BINDINGS, Bindings } from '../config/DefaultBindings';
import { C } from '../config/Colors';
import { ensureCamoTextures, makeCamoButton } from '../config/CamoTexture';

const DIFFICULTY_KEY   = 'zeroday_difficulty';
const ATTACK_MODE_KEY  = 'zeroday_attack_mode';
const MOVE_MODE_KEY    = 'zeroday_move_mode';

export function loadDifficulty(): string {
  return localStorage.getItem(DIFFICULTY_KEY) ?? 'medium';
}
function saveDifficulty(d: string) {
  localStorage.setItem(DIFFICULTY_KEY, d);
}

export type AttackMode = 'held' | 'tap';
export function loadAttackMode(): AttackMode {
  return (localStorage.getItem(ATTACK_MODE_KEY) ?? 'held') as AttackMode;
}
function saveAttackMode(m: AttackMode) {
  localStorage.setItem(ATTACK_MODE_KEY, m);
}

export type MoveMode = 'held' | 'tap';
export function loadMoveMode(): MoveMode {
  return (localStorage.getItem(MOVE_MODE_KEY) ?? 'held') as MoveMode;
}
function saveMoveMode(m: MoveMode) {
  localStorage.setItem(MOVE_MODE_KEY, m);
}

export class SettingsScene extends Phaser.Scene {
  private bindings!: Bindings;
  private listening: keyof Bindings | null = null;
  private listeningText?: Phaser.GameObjects.Text;
  private bindingTexts: Partial<Record<keyof Bindings, Phaser.GameObjects.Text>> = {};

  constructor() { super('SettingsScene'); }

  create() {
    this.bindings = loadBindings();
    ensureCamoTextures(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    const labelX = cx - 200;
    const valueX = cx + 130;

    this.add.tileSprite(0, 0, width, height, 'camo_bg').setOrigin(0);

    this.add.text(cx, 40, 'SETTINGS', {
      fontFamily: '"Press Start 2P"', fontSize: '32px', color: C.text,
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);

    let y = 100;

    // ── Difficulty row ─────────────────────────────────────────────
    this.add.text(labelX, y, 'DIFFICULTY', {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);

    const diffOpts = ['easy', 'medium', 'hard'];
    const diffInit = diffOpts.indexOf(loadDifficulty());
    this.makeCycleToggle(valueX, y, diffOpts.map(s => s.toUpperCase()), diffInit,
      (_, val) => saveDifficulty(val.toLowerCase()));

    // ── Attack mode row ────────────────────────────────────────────
    y += 50;
    this.add.text(labelX, y, 'ATTACK', {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);

    const atkOpts: AttackMode[] = ['held', 'tap'];
    const atkInit = atkOpts.indexOf(loadAttackMode());
    this.makeCycleToggle(valueX, y, atkOpts.map(s => s.toUpperCase()), atkInit,
      (_, val) => saveAttackMode(val.toLowerCase() as AttackMode));

    // ── Move mode row ──────────────────────────────────────────────
    y += 50;
    this.add.text(labelX, y, 'MOVEMENT', {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);

    const movOpts: MoveMode[] = ['tap', 'held'];
    const movInit = movOpts.indexOf(loadMoveMode());
    this.makeCycleToggle(valueX, y, movOpts.map(s => s.toUpperCase()), movInit,
      (_, val) => saveMoveMode(val.toLowerCase() as MoveMode));

    // ── Key bindings header + reset button ─────────────────────────
    y += 50;
    this.add.text(labelX, y, 'KEY BINDINGS', {
      fontFamily: '"Press Start 2P"', fontSize: '16px', color: C.subtext,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);

    makeCamoButton(this, valueX, y, 120, 28, 'RESET', '11px', C.subtext, C.btnStroke,
      () => this.resetToDefaults());

    // ── Rebindable rows ────────────────────────────────────────────
    const actions: (keyof Bindings)[] = ['up','down','left','right','break1','break2','attack'];
    const labels = ['Move Up','Move Down','Move Left','Move Right','Break 1','Break 2','Attack'];

    actions.forEach((action, i) => {
      const by = y + 40 + i * 36;
      this.add.text(labelX, by, labels[i], {
        fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0, 0.5);

      const bt = this.add.text(valueX, by, this.bindings[action], {
        fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.text,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      bt.on('pointerdown', () => this.startListening(action, bt));
      bt.on('pointerover', () => { if (this.listening !== action) bt.setAlpha(0.6); });
      bt.on('pointerout',  () => bt.setAlpha(1));
      this.bindingTexts[action] = bt;
    });

    // ── ESC / Pause row (non-rebindable) ───────────────────────────
    const escRowY = y + 40 + actions.length * 36;
    this.add.text(labelX, escRowY, 'Pause', {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    this.add.text(valueX, escRowY, 'ESC', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Bottom buttons ─────────────────────────────────────────────
    const backY = height - 50;
    this.makeButton(cx, backY, '← BACK', () => {
      saveBindings(this.bindings);
      this.scene.start('MenuScene');
    });

    // ── Key capture ────────────────────────────────────────────────
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (!this.listening) return;
      if (e.key === 'Escape') { this.cancelListening(); return; }
      const code = this.toPhaseKeyCode(e);
      for (const k of Object.keys(this.bindings) as (keyof Bindings)[]) {
        if (k !== this.listening && this.bindings[k] === code) {
          (this.bindings as any)[k] = '';
          this.bindingTexts[k]?.setText('');
        }
      }
      (this.bindings as any)[this.listening] = code;
      this.listeningText?.setText(code).setAlpha(1);
      this.listening = null;
      this.listeningText = undefined;
      saveBindings(this.bindings);
    });
  }

  // Cycle toggle — ◀ VALUE ▶ with dynamically positioned arrows so any
  // value length fits. All three objects share the same font size so they
  // sit on the same visual baseline without manual y-offset tweaks.
  private makeCycleToggle(
    x: number, y: number,
    values: string[],
    initIdx: number,
    onChange: (idx: number, value: string) => void,
  ) {
    let idx = initIdx;
    const PAD = 14; // px gap between text edge and arrow centre

    const valText = this.add.text(x, y + 2, values[idx], {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.text,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    const lArrow = this.add.text(0, y, '◀', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const rArrow = this.add.text(0, y, '▶', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const reposition = () => {
      const hw = valText.width / 2;
      lArrow.setX(x - hw - PAD);
      rArrow.setX(x + hw + PAD);
    };
    reposition();

    lArrow.on('pointerdown', () => {
      idx = (idx - 1 + values.length) % values.length;
      valText.setText(values[idx]);
      reposition();
      onChange(idx, values[idx]);
    });
    rArrow.on('pointerdown', () => {
      idx = (idx + 1) % values.length;
      valText.setText(values[idx]);
      reposition();
      onChange(idx, values[idx]);
    });
  }

  private resetToDefaults() {
    this.cancelListening();
    this.bindings = { ...DEFAULT_BINDINGS };
    for (const k of Object.keys(this.bindingTexts) as (keyof Bindings)[]) {
      this.bindingTexts[k]?.setText(this.bindings[k]).setAlpha(1);
    }
    saveBindings(this.bindings);
  }

  private startListening(action: keyof Bindings, text: Phaser.GameObjects.Text) {
    if (this.listening && this.listeningText) {
      this.listeningText.setAlpha(1).setText(this.bindings[this.listening]);
    }
    this.listening = action;
    this.listeningText = text;
    text.setText('...').setAlpha(0.5);
  }

  private toPhaseKeyCode(e: KeyboardEvent): string {
    const map: Record<string, string> = {
      ' ':           'SPACE',
      'ArrowLeft':   'LEFT',
      'ArrowRight':  'RIGHT',
      'ArrowUp':     'UP',
      'ArrowDown':   'DOWN',
      'Enter':       'ENTER',
      'Backspace':   'BACKSPACE',
      'Tab':         'TAB',
      'Shift':       'SHIFT',
      'Control':     'CTRL',
      'Alt':         'ALT',
    };
    return map[e.key] ?? e.key.toUpperCase();
  }

  private cancelListening() {
    if (this.listening && this.listeningText) {
      this.listeningText.setText(this.bindings[this.listening]).setAlpha(1);
    }
    this.listening = null;
    this.listeningText = undefined;
  }

  private makeButton(x: number, y: number, label: string, cb: () => void) {
    makeCamoButton(this, x, y, 200, 44, label, '15px', C.btnText, C.btnStroke, cb);
  }
}
