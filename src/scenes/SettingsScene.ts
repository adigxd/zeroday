import Phaser from 'phaser';
import { loadBindings, saveBindings, DEFAULT_BINDINGS, Bindings } from '../config/DefaultBindings';
import { loadTheme, saveTheme, getColors, Theme } from '../config/Theme';

const DIFFICULTY_KEY   = 'zeroday_difficulty';
const ATTACK_MODE_KEY  = 'zeroday_attack_mode';

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

export class SettingsScene extends Phaser.Scene {
  private bindings!: Bindings;
  private listening: keyof Bindings | null = null;
  private listeningText?: Phaser.GameObjects.Text;
  private bindingTexts: Partial<Record<keyof Bindings, Phaser.GameObjects.Text>> = {};
  private theme!: Theme;

  constructor() { super('SettingsScene'); }

  create() {
    this.bindings = loadBindings();
    this.theme    = loadTheme();

    const C = getColors(this.theme);
    const { width, height } = this.scale;
    const cx = width / 2;

    const labelX = cx - 200;
    const valueX = cx + 130;

    this.add.rectangle(0, 0, width, height, C.bgHex).setOrigin(0);

    this.add.text(cx, 40, 'SETTINGS', {
      fontFamily: '"Press Start 2P"', fontSize: '28px', color: C.text,
    }).setOrigin(0.5);

    let y = 100;

    // ── Theme row ──────────────────────────────────────────────────
    this.add.text(labelX, y, 'THEME', {
      fontFamily: '"Press Start 2P"', fontSize: '11px', color: C.subtext,
    }).setOrigin(0, 0.5);

    const icon = this.theme === 'light' ? '☀' : '☽';
    const themeBg = this.add.rectangle(valueX, y, 50, 34, C.btnBg)
      .setStrokeStyle(1, C.btnStroke).setInteractive({ useHandCursor: true });
    const themeIcon = this.add.text(valueX, y, icon, {
      fontFamily: '"Press Start 2P"', fontSize: '16px', color: C.btnText,
    }).setOrigin(0.5);
    themeBg.on('pointerover', () => themeBg.setFillStyle(C.btnHover));
    themeBg.on('pointerout',  () => themeBg.setFillStyle(C.btnBg));
    themeBg.on('pointerdown', () => {
      const newTheme = this.theme === 'light' ? 'dark' : 'light';
      saveTheme(newTheme);
      document.body.style.background = newTheme === 'dark' ? '#111111' : '#f0ede6';
      this.scene.restart();
    });
    void themeIcon;

    // ── Difficulty row ─────────────────────────────────────────────
    y += 50;
    this.add.text(labelX, y, 'DIFFICULTY', {
      fontFamily: '"Press Start 2P"', fontSize: '11px', color: C.subtext,
    }).setOrigin(0, 0.5);

    const diffOpts = ['easy', 'medium', 'hard'];
    const diffInit = diffOpts.indexOf(loadDifficulty());
    this.makeCycleToggle(valueX, y, diffOpts.map(s => s.toUpperCase()), diffInit, C,
      (_, val) => saveDifficulty(val.toLowerCase()));

    // ── Attack mode row ────────────────────────────────────────────
    y += 50;
    this.add.text(labelX, y, 'ATTACK', {
      fontFamily: '"Press Start 2P"', fontSize: '11px', color: C.subtext,
    }).setOrigin(0, 0.5);

    const atkOpts: AttackMode[] = ['held', 'tap'];
    const atkInit = atkOpts.indexOf(loadAttackMode());
    this.makeCycleToggle(valueX, y, atkOpts.map(s => s.toUpperCase()), atkInit, C,
      (_, val) => saveAttackMode(val.toLowerCase() as AttackMode));

    // ── Key bindings header + reset button ─────────────────────────
    y += 50;
    this.add.text(labelX, y, 'KEY BINDINGS', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.subtext,
    }).setOrigin(0, 0.5);

    const resetBg = this.add.rectangle(valueX, y, 120, 26, C.btnBg)
      .setStrokeStyle(1, C.btnStroke).setInteractive({ useHandCursor: true });
    const resetT = this.add.text(valueX, y, 'RESET', {
      fontFamily: '"Press Start 2P"', fontSize: '9px', color: C.subtext,
    }).setOrigin(0.5);
    resetBg.on('pointerover', () => { resetBg.setFillStyle(C.btnHover); resetT.setAlpha(0.6); });
    resetBg.on('pointerout',  () => { resetBg.setFillStyle(C.btnBg);    resetT.setAlpha(1); });
    resetBg.on('pointerdown', () => this.resetToDefaults());

    // ── Rebindable rows ────────────────────────────────────────────
    const actions: (keyof Bindings)[] = ['up','down','left','right','break1','break2','attack'];
    const labels = ['Move Up','Move Down','Move Left','Move Right','Break 1','Break 2','Attack'];

    actions.forEach((action, i) => {
      const by = y + 40 + i * 36;
      this.add.text(labelX, by, labels[i], {
        fontFamily: '"Press Start 2P"', fontSize: '11px', color: C.subtext,
      }).setOrigin(0, 0.5);

      const bt = this.add.text(valueX, by, this.bindings[action], {
        fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.text,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      bt.on('pointerdown', () => this.startListening(action, bt));
      bt.on('pointerover', () => { if (this.listening !== action) bt.setAlpha(0.6); });
      bt.on('pointerout',  () => bt.setAlpha(1));
      this.bindingTexts[action] = bt;
    });

    // ── ESC / Pause row (non-rebindable) ───────────────────────────
    const escRowY = y + 40 + actions.length * 36;
    this.add.text(labelX, escRowY, 'Pause', {
      fontFamily: '"Press Start 2P"', fontSize: '11px', color: C.dim,
    }).setOrigin(0, 0.5);
    this.add.text(valueX, escRowY, 'ESC', {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.dim,
    }).setOrigin(0.5);

    // ── Bottom buttons ─────────────────────────────────────────────
    const backY = height - 50;
    this.makeButton(cx, backY, '← BACK', C, () => {
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
    C: ReturnType<typeof getColors>,
    onChange: (idx: number, value: string) => void,
  ) {
    let idx = initIdx;
    const PAD = 14; // px gap between text edge and arrow centre

    const valText = this.add.text(x, y, values[idx], {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.text,
    }).setOrigin(0.5);

    const lArrow = this.add.text(0, y, '◀', {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.dim,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const rArrow = this.add.text(0, y, '▶', {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.dim,
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

  private makeButton(x: number, y: number, label: string, C: ReturnType<typeof getColors>, cb: () => void) {
    const bw = 200, bh = 40;
    const bg = this.add.rectangle(x, y, bw, bh, C.btnBg).setStrokeStyle(2, C.btnStroke).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.btnText }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(C.btnHover));
    bg.on('pointerout',  () => bg.setFillStyle(C.btnBg));
    bg.on('pointerdown', cb);
    void t;
  }
}
