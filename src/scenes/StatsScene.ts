import Phaser from 'phaser';
import { loadStats } from '../systems/StatsTracker';
import { C } from '../config/Colors';
import { ensureCamoTextures, makeCamoButton } from '../config/CamoTexture';

export class StatsScene extends Phaser.Scene {
  constructor() { super('StatsScene'); }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const rowW = 520;
    const rowH = 40;

    ensureCamoTextures(this);
    this.add.tileSprite(0, 0, width, height, 'camo_bg').setOrigin(0);

    this.add.text(cx, 32, 'LIFETIME STATS', {
      fontFamily: '"Press Start 2P"', fontSize: '22px', color: C.text,
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);

    const stats = loadStats();
    let y = 80;

    // ── Singleplayer ──────────────────────────────────────────────────────
    this.add.text(cx, y, 'SINGLEPLAYER', {
      fontFamily: '"Press Start 2P"', fontSize: '15px', color: C.subtext,
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    y += 32;

    const spRows: [string, string | number][] = [
      ['Kills',                   stats.kills],
      ['Deaths',                  stats.deaths],
      ['Blocks Broken',           stats.blocksbroken],
      ['Shots Fired',             stats.shotsfired],
      ['Item Pickups',            stats.itempickups],
      ['Max Winstreak (Easy)',    stats.maxWinstreakEasy],
      ['Max Winstreak (Medium)',  stats.maxWinstreakMed],
      ['Max Winstreak (Hard)',    stats.maxWinstreakHard],
    ];

    for (const [label, value] of spRows) {
      this.add.rectangle(cx, y, rowW + 4, rowH + 4, 0x000000); // black outer border
      this.add.rectangle(cx, y, rowW, rowH, C.rowBg).setStrokeStyle(1, C.rowStroke);
      this.add.text(cx - rowW / 2 + 16, y, String(label), {
        fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0, 0.5);
      this.add.text(cx + rowW / 2 - 16, y, String(value), {
        fontFamily: '"Press Start 2P"', fontSize: '15px', color: C.text,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(1, 0.5);
      y += rowH + 6;
    }

    y += 18;

    // ── Multiplayer ───────────────────────────────────────────────────────
    this.add.text(cx, y, 'MULTIPLAYER', {
      fontFamily: '"Press Start 2P"', fontSize: '15px', color: C.subtext,
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    y += 32;

    const mpRows: [string, string][] = [
      ['Wins',        '—'],
      ['Losses',      '—'],
      ['Max Winstreak', '—'],
    ];

    for (const [label, value] of mpRows) {
      this.add.rectangle(cx, y, rowW + 4, rowH + 4, 0x000000); // black outer border
      this.add.rectangle(cx, y, rowW, rowH, C.rowBg).setStrokeStyle(1, C.rowStroke);
      this.add.text(cx - rowW / 2 + 16, y, label, {
        fontFamily: '"Press Start 2P"', fontSize: '13px', color: C.subtext,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0, 0.5);
      this.add.text(cx + rowW / 2 - 16, y, value, {
        fontFamily: '"Press Start 2P"', fontSize: '15px', color: C.subtext,
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(1, 0.5);
      y += rowH + 6;
    }

    // ── Back button ───────────────────────────────────────────────────────
    makeCamoButton(this, cx, height - 52, 200, 44, '← BACK', '15px', C.btnText, C.btnStroke,
      () => this.scene.start('MenuScene'));
  }
}
