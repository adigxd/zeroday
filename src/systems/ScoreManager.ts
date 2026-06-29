export interface CombatantScore {
  id:           string;
  colorName:    string;
  roundPoints:  number;
  roundDamage:  number; // damage dealt this round
}

export class ScoreManager {
  private scores: Map<string, CombatantScore> = new Map();

  register(id: string, colorName: string) {
    if (this.scores.has(id)) {
      // Preserve accumulated round points — only reset per-round damage
      this.scores.get(id)!.roundDamage = 0;
    } else {
      this.scores.set(id, { id, colorName, roundPoints: 0, roundDamage: 0 });
    }
  }

  addRoundPoint(id: string) {
    const s = this.scores.get(id);
    if (s) s.roundPoints++;
  }

  addDamage(id: string, amount: number) {
    const s = this.scores.get(id);
    if (s) s.roundDamage += amount;
  }

  resetRoundDamage() {
    this.scores.forEach(s => { s.roundDamage = 0; });
  }

  getAll(): CombatantScore[] {
    return [...this.scores.values()];
  }

  get(id: string): CombatantScore | undefined {
    return this.scores.get(id);
  }

  topDamageDealer(): CombatantScore | null {
    let top: CombatantScore | null = null;
    this.scores.forEach(s => {
      if (!top || s.roundDamage > top.roundDamage) top = s;
    });
    return top;
  }
}
