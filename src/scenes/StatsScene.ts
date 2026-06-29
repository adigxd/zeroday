import Phaser from 'phaser';
import { loadStats } from '../systems/StatsTracker';
import { loadTheme, getColors } from '../config/Theme';

export class StatsScene extends Phaser.Scene {
  constructor() { super('StatsScene'); }

  create() {
    const C = getColors(loadTheme());
    const { width, height } = this.scale;
    const cx = width / 2;

    this.add.rectangle(0, 0, width, height, C.bgHex).setOrigin(0);

    this.add.text(cx, 40, 'LIFETIME STATS', {
      fontFamily: '"Press Start 2P"', fontSize: '22px', color: C.text,
    }).setOrigin(0.5);

    const stats = loadStats();
    const rows: [string, string | number][] = [
      ['Blocks Broken', stats.blocksbroken],
      ['Shots Fired',   stats.shotsfired],
      ['Kills',         stats.kills],
      ['Deaths',        stats.deaths],
      ['Item Pickups',  stats.itempickups],
    ];

    rows.forEach(([label, value], i) => {
      const y = 130 + i * 54;
      this.add.rectangle(cx, y, 480, 42, C.rowBg).setStrokeStyle(1, C.rowStroke);
      this.add.text(cx - 210, y, String(label), {
        fontFamily: '"Press Start 2P"', fontSize: '12px', color: C.subtext,
      }).setOrigin(0, 0.5);
      this.add.text(cx + 210, y, String(value), {
        fontFamily: '"Press Start 2P"', fontSize: '14px', color: C.text,
      }).setOrigin(1, 0.5);
    });

    const bw = 200, bh = 40;
    const by = height - 60;
    const bg = this.add.rectangle(cx, by, bw, bh, C.btnBg).setStrokeStyle(2, C.btnStroke).setInteractive({ useHandCursor: true });
    const t = this.add.text(cx, by, '← BACK', { fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.btnText }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(C.btnHover));
    bg.on('pointerout',  () => bg.setFillStyle(C.btnBg));
    bg.on('pointerdown', () => this.scene.start('MenuScene'));
    void t;
  }
}
