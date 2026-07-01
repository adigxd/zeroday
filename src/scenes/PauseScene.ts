import Phaser from 'phaser';
import { C } from '../config/Colors';
import { ensureCamoTextures, makeCamoButton } from '../config/CamoTexture';
import { loadBindings } from '../config/DefaultBindings';

export class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    ensureCamoTextures(this);
    this.add.tileSprite(0, 0, width, height, 'camo_bg').setOrigin(0).setAlpha(0.88);

    this.add.text(cx, cy - 90, 'PAUSED', {
      fontFamily: '"Press Start 2P"', fontSize: '46px', color: C.text,
      stroke: '#000000', strokeThickness: 7,
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

    this.makeButton(cx, cy + 10, 'RESUME', doResume);
    this.makeButton(cx, cy + 70, 'QUIT TO MENU', doMenu);

    // ESC = quit to menu; attack hotkey = resume (mirrors round-end screen)
    this.input.keyboard!.once('keydown-ESC', doMenu);
    const attackBinding = loadBindings().attack;
    const attackKey = this.input.keyboard!.addKey(
      (Phaser.Input.Keyboard.KeyCodes as any)[attackBinding] ?? attackBinding
    );
    attackKey.once('down', doResume);
  }

  private makeButton(x: number, y: number, label: string, cb: () => void) {
    makeCamoButton(this, x, y, 290, 52, label, '18px', C.btnText, C.btnStroke, cb);
  }
}
