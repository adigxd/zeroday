export interface RoundResult {
  round: number;
  mapSize: string;
  durationMs: number;
  stateVisits: Record<string, number>;
  positionChanges: number;
}

export class AITestReport {
  private rounds: RoundResult[] = [];
  private currentRound: RoundResult | null = null;

  startRound(round: number, mapW: number, mapH: number) {
    this.currentRound = {
      round,
      mapSize: `${mapW}×${mapH}`,
      durationMs: 0,
      stateVisits: {},
      positionChanges: 0,
    };
  }

  recordState(state: string) {
    if (!this.currentRound) return;
    this.currentRound.stateVisits[state] = (this.currentRound.stateVisits[state] ?? 0) + 1;
  }

  recordMove() {
    if (this.currentRound) this.currentRound.positionChanges++;
  }

  endRound(durationMs: number) {
    if (!this.currentRound) return;
    this.currentRound.durationMs = durationMs;
    this.rounds.push(this.currentRound);
    this.currentRound = null;
  }

  print() {
    const total = this.rounds.length;
    if (total === 0) { console.log('[AITest] No rounds completed.'); return; }

    const avgMoves = (
      this.rounds.reduce((s, r) => s + r.positionChanges, 0) / total
    ).toFixed(0);

    console.group(`%c[AI TEST REPORT] ${total} rounds`, 'font-weight:bold;color:#4af');
    console.log(`Avg moves per round : ${avgMoves}`);
    console.groupEnd();
  }
}
