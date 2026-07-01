// Theme texture + button helper.
// Scenes call ensureCamoTextures() once, then use 'camo_bg' / 'camo_btn' texture keys
// and makeCamoButton() for buttons. Both branch on the active theme's skin type so
// scene code never needs to change when a new skin is introduced.

import { getActiveTheme, CamoSkin } from './UITheme';

function hexToRgb(h: number) {
  return { r: (h >> 16) & 0xff, g: (h >> 8) & 0xff, b: h & 0xff };
}

function genCamo(colors: number[], size: number, blockSize: number): HTMLCanvasElement {
  const cc = document.createElement('canvas');
  cc.width = cc.height = size;
  const ctx = cc.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const f1x = 0.035 + Math.random() * 0.025, f1y = 0.025 + Math.random() * 0.020;
  const f2x = 0.018 + Math.random() * 0.025, f2y = 0.042 + Math.random() * 0.020;
  const f3x = 0.050 + Math.random() * 0.018, f3y = 0.012 + Math.random() * 0.030;
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  const p3 = Math.random() * Math.PI * 2;
  const n = colors.length;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bx = Math.floor(x / blockSize) * blockSize + blockSize * 0.5;
      const by = Math.floor(y / blockSize) * blockSize + blockSize * 0.5;
      const v = Math.sin(bx * f1x + by * f1y + p1)
              + Math.sin(bx * f2x + by * f2y + p2)
              + Math.sin(bx * f3x + by * f3y + p3);
      const idx = Math.min(n - 1, Math.floor((v + 3) / 6 * n));
      const { r, g, b } = hexToRgb(colors[idx]);
      const off = (y * size + x) * 4;
      d[off] = r; d[off + 1] = g; d[off + 2] = b; d[off + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return cc;
}

function genSolid(color: number): HTMLCanvasElement {
  const cc = document.createElement('canvas');
  cc.width = cc.height = 4;
  const ctx = cc.getContext('2d')!;
  const { r, g, b } = hexToRgb(color);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 4, 4);
  return cc;
}

// Generates 'camo_bg' and 'camo_btn' textures according to the active skin.
// For solid skins the textures are plain-color canvases — the same keys are used
// so scene tileSprite / image calls require no modification.
export function ensureCamoTextures(scene: Phaser.Scene) {
  const { skin, colors } = getActiveTheme();

  if (!scene.textures.exists('camo_bg')) {
    const canvas = skin.type === 'camo'
      ? genCamo((skin as CamoSkin).bgColors,  512, (skin as CamoSkin).bgBlockSize)
      : genSolid(colors.bgHex);
    scene.textures.addCanvas('camo_bg', canvas);
  }

  if (!scene.textures.exists('camo_btn')) {
    const canvas = skin.type === 'camo'
      ? genCamo((skin as CamoSkin).btnColors, 256, (skin as CamoSkin).btnBlockSize)
      : genSolid(colors.btnBg);
    scene.textures.addCanvas('camo_btn', canvas);
  }
}

// Builds a themed button. Appearance depends on the active skin:
//   camo   — black outer border + procedural camo image fill + tint-on-hover
//   solid  — black outer border + solid color fill + color-swap-on-hover
// Returns the interactive hit rectangle.
export function makeCamoButton(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  label: string,
  fontSize: string,
  btnText: string,
  btnStroke: number,
  cb: () => void,
): Phaser.GameObjects.Rectangle {
  const { skin, colors } = getActiveTheme();

  scene.add.rectangle(x, y, w + 6, h + 6, 0x000000); // black outer border

  let hit: Phaser.GameObjects.Rectangle;

  if (skin.type === 'camo') {
    const img = scene.add.image(x, y, 'camo_btn').setDisplaySize(w, h);
    hit = scene.add.rectangle(x, y, w, h, 0, 0)
      .setStrokeStyle(2, btnStroke)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => img.setTint(0x888888));
    hit.on('pointerout',  () => img.clearTint());
  } else {
    // solid (or any future non-camo skin): plain filled rectangle
    hit = scene.add.rectangle(x, y, w, h, colors.btnBg)
      .setStrokeStyle(2, btnStroke)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => hit.setFillStyle(colors.btnHover));
    hit.on('pointerout',  () => hit.setFillStyle(colors.btnBg));
  }

  scene.add.text(x, y, label, {
    fontFamily: '"Press Start 2P"', fontSize, color: btnText,
    stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5);

  hit.on('pointerdown', cb);
  return hit;
}
