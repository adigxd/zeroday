import Phaser from 'phaser';
import { loadTheme, getColors } from '../config/Theme';

export class MenuScene extends Phaser.Scene {
  private playerCount = 2;
  private countText!: Phaser.GameObjects.Text;

  constructor() { super('MenuScene'); }

  create() {
    const C = getColors(loadTheme());
    const { width, height } = this.scale;
    const cx = width / 2;

    this.add.rectangle(0, 0, width, height, C.bgHex).setOrigin(0);
    this.drawGrid(width, height, C.gridLine);

    this.add.text(cx, height * 0.18, 'ZERODAY', {
      fontFamily: '"Press Start 2P"',
      fontSize: '48px',
      color: C.text,
      stroke: C.dim,
      strokeThickness: 4,
    }).setOrigin(0.5);

    const pcY = height * 0.42;
    this.add.text(cx, pcY - 40, 'PLAYERS', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.subtext,
    }).setOrigin(0.5);

    this.makeArrow(cx - 40, pcY, '◀', C, () => this.changeCount(-1));
    this.countText = this.add.text(cx, pcY, String(this.playerCount), {
      fontFamily: '"Press Start 2P"', fontSize: '28px', color: C.text,
    }).setOrigin(0.5);
    this.makeArrow(cx + 40, pcY, '▶', C, () => this.changeCount(1));

    this.makeMainButton(cx, height * 0.57, 'PLAY', C, () => {
      this.scene.start('GameScene', { playerCount: this.playerCount, roundNumber: 1 });
    });
    this.makeMainButton(cx, height * 0.68, 'SETTINGS', C, () => {
      this.scene.start('SettingsScene');
    });
    this.makeMainButton(cx, height * 0.79, 'STATS', C, () => {
      this.scene.start('StatsScene');
    });
  }

  private drawGrid(w: number, h: number, color: number) {
    const g = this.add.graphics();
    g.lineStyle(1, color, 1);
    const size = 40;
    for (let x = 0; x < w; x += size) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.strokePath(); }
    for (let y = 0; y < h; y += size) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath(); }
  }

  private changeCount(d: number) {
    this.playerCount = Phaser.Math.Clamp(this.playerCount + d, 2, 4);
    this.countText.setText(String(this.playerCount));
  }

  private makeArrow(x: number, y: number, label: string, C: ReturnType<typeof getColors>, cb: () => void) {
    const t = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"', fontSize: '18px', color: C.dim,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setAlpha(0.6));
    t.on('pointerout',  () => t.setAlpha(1));
    t.on('pointerdown', cb);
    return t;
  }

  private makeMainButton(x: number, y: number, label: string, C: ReturnType<typeof getColors>, cb: () => void) {
    const bw = 240, bh = 44;
    const bg = this.add.rectangle(x, y, bw, bh, C.btnBg).setStrokeStyle(2, C.btnStroke).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"', fontSize: '16px', color: C.btnText,
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(C.btnHover));
    bg.on('pointerout',  () => bg.setFillStyle(C.btnBg));
    bg.on('pointerdown', cb);
    void t;
    return bg;
  }
}
