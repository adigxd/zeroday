import Phaser from 'phaser';
import { AITestReport } from './AITestReport';
import { CANVAS_W, CANVAS_H } from '../config/GameConfig';

const TOTAL_ROUNDS = 25;

/**
 * Coordinator scene for the AI stress test.
 * Activated by opening the game with ?test in the URL.
 *
 * How to run:
 *   bun run test  →  open http://localhost:3000/?test
 *
 * Runs 25 rounds of 20 seconds each (~8 min).
 * Player is frozen. AI gets a fresh random map each round.
 * When all rounds complete, open DevTools console for the full report.
 */
export class AITestCoordinator extends Phaser.Scene {
  private report = new AITestReport();
  private roundNum = 0;
  private hudText!: Phaser.GameObjects.Text;

  constructor() { super('AITestCoordinator'); }

  create() {
    this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x111111).setOrigin(0);

    this.hudText = this.add.text(CANVAS_W / 2, CANVAS_H / 2, '', {
      fontFamily: '"Press Start 2P"',
      fontSize: '13px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5).setDepth(200);

    // Listen for round-complete events emitted by GameScene via game.events
    this.game.events.on('test-round-complete', this.onRoundComplete, this);

    // Kick off the first round
    this.launchNextRound();
  }

  private launchNextRound() {
    this.roundNum++;

    if (this.roundNum > TOTAL_ROUNDS) {
      this.scene.stop('GameScene');
      this.report.print();
      this.hudText.setText(
        `AI STRESS TEST COMPLETE\n\n${TOTAL_ROUNDS} rounds done.\n\nOpen DevTools console\nfor full report.`
      );
      return;
    }

    this.hudText.setText(
      `AI STRESS TEST\n\nRound ${this.roundNum} / ${TOTAL_ROUNDS}\n\n20s per round — please wait.\nOpen console after all rounds.`
    );

    if (this.roundNum === 1) {
      // First round: launch GameScene on top of this coordinator
      this.scene.launch('GameScene', {
        playerCount: 2,
        roundNumber: 1,
        testMode: true,
      });
    }
    // Subsequent rounds: GameScene restarts itself via scene.restart() after each round
  }

  private onRoundComplete(payload: {
    aiMoves: number;
    mapW: number;
    mapH: number;
    roundNumber: number;
  }) {
    const { aiMoves, mapW, mapH, roundNumber } = payload;

    this.report.startRound(roundNumber, mapW, mapH);
    for (let i = 0; i < aiMoves; i++) this.report.recordMove();
    this.report.endRound(20_000);

    console.log(
      `[AITest] Round ${roundNumber}/${TOTAL_ROUNDS} done — ` +
      `moves=${aiMoves} map=${mapW}×${mapH}`
    );

    // launchNextRound increments roundNum; GameScene has already scheduled its own restart
    this.launchNextRound();
  }

  shutdown() {
    this.game.events.off('test-round-complete', this.onRoundComplete, this);
  }
}
