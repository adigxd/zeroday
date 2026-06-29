export interface LifetimeStats {
  blocksbroken: number;
  shotsfired:   number;
  kills:        number;
  deaths:       number;
  itempickups:  number;
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

function defaultStats(): LifetimeStats {
  return { blocksbroken: 0, shotsfired: 0, kills: 0, deaths: 0, itempickups: 0 };
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
