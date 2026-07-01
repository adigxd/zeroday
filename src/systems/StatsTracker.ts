export interface LifetimeStats {
  blocksbroken:      number;
  shotsfired:        number;
  kills:             number;
  deaths:            number;
  itempickups:       number;
  maxWinstreakEasy:  number;
  maxWinstreakMed:   number;
  maxWinstreakHard:  number;
}

const KEY = 'zeroday_stats';

export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {}
  return defaultStats();
}

export function saveStats(s: LifetimeStats): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function updateMaxWinstreak(difficulty: string, streak: number): void {
  const s = loadStats();
  if (difficulty === 'easy')   { if (streak > s.maxWinstreakEasy) { s.maxWinstreakEasy = streak; saveStats(s); } }
  if (difficulty === 'medium') { if (streak > s.maxWinstreakMed)  { s.maxWinstreakMed  = streak; saveStats(s); } }
  if (difficulty === 'hard')   { if (streak > s.maxWinstreakHard) { s.maxWinstreakHard = streak; saveStats(s); } }
}

function defaultStats(): LifetimeStats {
  return {
    blocksbroken: 0, shotsfired: 0, kills: 0, deaths: 0, itempickups: 0,
    maxWinstreakEasy: 0, maxWinstreakMed: 0, maxWinstreakHard: 0,
  };
}

export class StatsTracker {
  private stats: LifetimeStats;

  constructor() {
    this.stats = loadStats();
  }

  increment(key: keyof LifetimeStats, amount = 1) {
    this.stats[key] += amount;
    saveStats(this.stats);
  }

  getStats(): LifetimeStats {
    return { ...this.stats };
  }
}
