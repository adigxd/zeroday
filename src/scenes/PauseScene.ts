import Phaser from 'phaser';
import { loadTheme, getColors } from '../config/Theme';
import { loadBindings } from '../config/DefaultBindings';

export class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  create() {
    const C = getColors(loadTheme());
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    this.add.rectangle(0, 0, width, height, C.bgHex, 0.88).setOrigin(0);

    this.add.text(cx, cy - 90, 'PAUSED', {
      fontFamily: '"Press Start 2P"', fontSize: '42px', color: C.text,
    }).setOrigin(0.5);

    const doResume = () => {
      this.scene.stop();
      this.scene.resume('GameScene');
    };
    const doMenu = () => {
      this.scene.stop();
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    };

    this.makeButton(cx, cy + 10, 'RESUME', C, doResume);
    this.makeButton(cx, cy + 70, 'QUIT TO MENU', C, doMenu);

    // ESC = quit to menu; attack hotkey = resume (mirrors round-end screen)
    this.input.keyboard!.once('keydown-ESC', doMenu);
    const attackBinding = loadBindings().attack;
    const attackKey = this.input.keyboard!.addKey(
      (Phaser.Input.Keyboard.KeyCodes as any)[attackBinding] ?? attackBinding
    );
    attackKey.once('down', doResume);
  }

  private makeButton(x: number, y: number, label: string, C: ReturnType<typeof getColors>, cb: () => void) {
    const bw = 290, bh = 50;
    const bg = this.add.rectangle(x, y, bw, bh, C.btnBg).setStrokeStyle(2, C.btnStroke).setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, label, { fontFamily: '"Press Start 2P"', fontSize: '16px', color: C.btnText }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(C.btnHover));
    bg.on('pointerout',  () => bg.setFillStyle(C.btnBg));
    bg.on('pointerdown', cb);
    void t;
  }
}
