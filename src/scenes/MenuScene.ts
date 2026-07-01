import Phaser from 'phaser';
import { C } from '../config/Colors';
import { ensureCamoTextures, makeCamoButton } from '../config/CamoTexture';
import { MENU_BG_COUNT } from '../config/GameConfig';

export class MenuScene extends Phaser.Scene {
  private playerCount = 4;
  private countText!: Phaser.GameObjects.Text;
  private bgIndex = 0;
  private titleJitterTimer?: Phaser.Time.TimerEvent;

  constructor() { super('MenuScene'); }

  preload() {
    this.bgIndex = Math.floor(Math.random() * MENU_BG_COUNT);
    this.load.image('menu_bg', `assets/art/menu/${this.bgIndex}.png`);
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Art background — scale to cover canvas (crop, maintain aspect ratio)
    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    const bgScale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(bgScale);

    ensureCamoTextures(this);

    const titleImg = this.buildTitle(cx, height * 0.20);

    // Bg desaturation on title hover (WebGL preFX) — no brightness change
    titleImg.on('pointerover', () => {
      if (bg.preFX) {
        bg.preFX.clear();
        bg.preFX.addColorMatrix().grayscale(0.75);
      }
    });
    titleImg.on('pointerout', () => {
      if (bg.preFX) bg.preFX.clear();
    });

    const pcY = height * 0.42;
    this.add.text(cx, pcY - 40, 'PLAYERS', {
      fontFamily: '"Press Start 2P"', fontSize: '16px', color: C.subtext,
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.countText = this.add.text(cx, pcY + 8, String(this.playerCount), {
      fontFamily: '"Press Start 2P"', fontSize: '32px', color: C.text,
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    const PAD = 32;
    const ARROW_Y = pcY + 6;
    const reposition = () => {
      lArrow.setX(cx - this.countText.width / 2 - PAD);
      rArrow.setX(cx + this.countText.width / 2 + PAD);
    };

    const lArrow = this.add.text(0, ARROW_Y, '◀', {
      fontFamily: '"Press Start 2P"', fontSize: '28px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const rArrow = this.add.text(0, ARROW_Y, '▶', {
      fontFamily: '"Press Start 2P"', fontSize: '28px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    reposition();

    lArrow.on('pointerover', () => lArrow.setAlpha(0.6));
    lArrow.on('pointerout',  () => lArrow.setAlpha(1));
    lArrow.on('pointerdown', () => { this.changeCount(-1); reposition(); });
    rArrow.on('pointerover', () => rArrow.setAlpha(0.6));
    rArrow.on('pointerout',  () => rArrow.setAlpha(1));
    rArrow.on('pointerdown', () => { this.changeCount(1); reposition(); });

    // Stacked buttons — 56px gap between centers (12px between edges at bh=44)
    const BTN_Y0  = height * 0.53;
    const BTN_GAP = 56;
    this.makeMainButton(cx, BTN_Y0,             'PLAY', () => {
      this.scene.start('GameScene', { playerCount: this.playerCount, roundNumber: 1 });
    });
    this.makeMainButton(cx, BTN_Y0 + BTN_GAP,   'SETTINGS', () => {
      this.scene.start('SettingsScene');
    });
    this.makeMainButton(cx, BTN_Y0 + BTN_GAP*2, 'STATS', () => {
      this.scene.start('StatsScene');
    });
    this.makeMainButton(cx, BTN_Y0 + BTN_GAP*3, 'GALLERY', () => {
      this.scene.start('GalleryScene');
    });
  }

  // Builds the perspective title. Normal state is a static canvas texture.
  // Hover state uses a CanvasTexture refreshed on a timer so each letter
  // continuously jiggles with independent random offsets (seize effect).
  private buildTitle(x: number, y: number): Phaser.GameObjects.Image {
    const TEXT         = 'ZERODAY';
    const FONT_SIZE    = 120;
    const TOP_SCALE    = 0.95;
    const SHADOW_STEPS = 8;
    const SHADOW_DY    = 6;
    const SHADOW_DX    = 12;
    const STROKE_W     = 20;
    const STROKE_EXT   = Math.ceil(STROKE_W / 2);
    const PAD          = STROKE_EXT + 4;
    const TAN_NORMAL   = '#ccaa82';
    const TAN_HOVER    = '#b0a494';
    const CW           = 1400;
    const CH           = Math.ceil(FONT_SIZE + SHADOW_STEPS * SHADOW_DY + STROKE_EXT * 2 + 60);
    const textCY       = STROKE_EXT + 30 + FONT_SIZE / 2;
    const charH        = FONT_SIZE + PAD * 2;
    const JITTER_AMP   = 1.8;
    const JITTER_MS    = 80; // ~12 fps shake

    const tmpCtx = document.createElement('canvas').getContext('2d')!;
    tmpCtx.font = `${FONT_SIZE}px "Press Start 2P"`;
    const chars      = TEXT.split('');
    const charWidths = chars.map(c => tmpCtx.measureText(c).width);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0);
    let cur = CW / 2 - totalWidth / 2;
    const charCenters = charWidths.map(w => { const cc = cur + w / 2; cur += w; return cc; });

    const makeCharBuf = (char: string, cw: number, shadow: boolean, tan: string) => {
      const cc = document.createElement('canvas');
      cc.width  = Math.ceil(cw + PAD * 2);
      cc.height = charH;
      const cx  = cc.getContext('2d')!;
      cx.font = `${FONT_SIZE}px "Press Start 2P"`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const mx = cc.width / 2, my = PAD + FONT_SIZE / 2;
      if (!shadow) {
        cx.strokeStyle = '#000000'; cx.lineWidth = STROKE_W; cx.lineJoin = 'round';
        cx.strokeText(char, mx, my);
      }
      cx.fillStyle = shadow ? '#000000' : tan;
      cx.fillText(char, mx, my);
      return cc;
    };

    // Pre-render char bufs once — reused every jitter tick
    const shadowBufs = chars.map((ch, i) => makeCharBuf(ch, charWidths[i], true,  TAN_NORMAL));
    const mainBufs   = chars.map((ch, i) => makeCharBuf(ch, charWidths[i], false, TAN_NORMAL));
    const hoverBufs  = chars.map((ch, i) => makeCharBuf(ch, charWidths[i], false, TAN_HOVER));

    type Jitter = { dx: number; dy: number };
    const ZERO: Jitter[] = chars.map(() => ({ dx: 0, dy: 0 }));
    const rand = (): Jitter[] => chars.map(() => ({
      dx: (Math.random() * 2 - 1) * JITTER_AMP,
      dy: (Math.random() * 2 - 1) * JITTER_AMP,
    }));

    // Shared draw routine — writes into any 2D context with given jitter
    const draw = (ctx: CanvasRenderingContext2D, hovered: boolean, j: Jitter[]) => {
      ctx.clearRect(0, 0, CW, CH);
      ctx.imageSmoothingEnabled = false;
      const mBufs = hovered ? hoverBufs : mainBufs;

      for (let layer = SHADOW_STEPS; layer >= 1; layer--) {
        chars.forEach((_, i) => {
          const co   = charCenters[i] - CW / 2;
          const norm = totalWidth > 0 ? co / (totalWidth / 2) : 0;
          const src  = shadowBufs[i];
          ctx.drawImage(src,
            CW / 2 + co + layer * SHADOW_DX * (-norm) + j[i].dx - src.width / 2,
            textCY - FONT_SIZE / 2 + layer * SHADOW_DY + j[i].dy - PAD,
          );
        });
      }

      const STRIP = 8;
      for (let row = -STROKE_EXT; row < FONT_SIZE + STROKE_EXT; row += STRIP) {
        const h      = Math.min(STRIP, FONT_SIZE + STROKE_EXT - row);
        const mid    = Math.max(0, Math.min(FONT_SIZE - 1, row + h / 2));
        const scaleX = TOP_SCALE + (1 - TOP_SCALE) * (mid / (FONT_SIZE - 1));
        chars.forEach((_, i) => {
          const co = charCenters[i] - CW / 2;
          const src = mBufs[i];
          const sw = src.width, sy = PAD + row;
          if (sy < 0 || sy + h > src.height) return;
          const dw = sw * scaleX;
          ctx.drawImage(src, 0, sy, sw, h,
            CW / 2 + co * scaleX + j[i].dx - (sw / 2) * scaleX,
            textCY - FONT_SIZE / 2 + row + j[i].dy,
            dw, h,
          );
        });
      }
    };

    const K_NORM  = 'menu_title';
    const K_HOVER = 'menu_title_hover';
    if (this.textures.exists(K_NORM))  this.textures.remove(K_NORM);
    if (this.textures.exists(K_HOVER)) this.textures.remove(K_HOVER);

    // Normal: static canvas built once
    const normCanvas = document.createElement('canvas');
    normCanvas.width = CW; normCanvas.height = CH;
    draw(normCanvas.getContext('2d')!, false, ZERO);
    this.textures.addCanvas(K_NORM, normCanvas);

    // Hover: CanvasTexture — can be redrawn + refreshed each jitter tick
    const hoverTex = this.textures.createCanvas(K_HOVER, CW, CH) as Phaser.Textures.CanvasTexture;
    draw(hoverTex.getContext(), true, ZERO);
    hoverTex.refresh();

    const img = this.add.image(x, y, K_NORM).setOrigin(0.5, 0).setDepth(12).setInteractive();

    img.on('pointerover', () => {
      img.setTexture(K_HOVER);
      this.titleJitterTimer?.remove();
      const tick = () => { draw(hoverTex.getContext(), true, rand()); hoverTex.refresh(); };
      tick();
      this.titleJitterTimer = this.time.addEvent({ delay: JITTER_MS, callback: tick, loop: true });
    });
    img.on('pointerout', () => {
      this.titleJitterTimer?.remove();
      this.titleJitterTimer = undefined;
      img.setTexture(K_NORM);
    });

    return img;
  }

  private changeCount(d: number) {
    this.playerCount = Phaser.Math.Clamp(this.playerCount + d, 2, 4);
    this.countText.setText(String(this.playerCount));
  }

  private makeArrow(x: number, y: number, label: string, cb: () => void) {
    const t = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"', fontSize: '20px', color: C.dim,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setAlpha(0.6));
    t.on('pointerout',  () => t.setAlpha(1));
    t.on('pointerdown', cb);
    return t;
  }

  private makeMainButton(x: number, y: number, label: string, cb: () => void) {
    return makeCamoButton(this, x, y, 260, 46, label, '18px', C.btnText, C.btnStroke, cb);
  }
}
