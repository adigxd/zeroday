import Phaser from 'phaser';
import { MenuScene }     from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GameScene }     from './scenes/GameScene';
import { PauseScene }    from './scenes/PauseScene';
import { StatsScene }    from './scenes/StatsScene';
import { GalleryScene }  from './scenes/GalleryScene';
import { AITestCoordinator } from './test/AITestCoordinator';
import { CANVAS_W, CANVAS_H } from './config/GameConfig';


const IS_TEST = import.meta.env.MODE === 'test' && new URLSearchParams(location.search).has('test');

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width:  CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#000000',
  scene: IS_TEST
    ? [AITestCoordinator, GameScene, SettingsScene, PauseScene, StatsScene, GalleryScene]
    : [MenuScene, SettingsScene, GameScene, PauseScene, StatsScene, GalleryScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_W,
    height: CANVAS_H,
  },
  input: {
    activePointers: 3,
  },
};

// Wait for Press Start 2P to load before starting Phaser so text renders
// correctly on the first frame (without this, font falls back until cached).
document.fonts.load('16px "Press Start 2P"').finally(() => {
  (window as any).__game = new Phaser.Game(config);
});
