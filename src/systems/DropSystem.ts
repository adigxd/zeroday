import { DROP_TABLE } from '../config/GameConfig';

export function rollDrop(): string {
  // 50% chance of no drop from any crate
  if (Math.random() < 0.5) return 'nothing';
  const eligible = DROP_TABLE.filter(e => e.item !== 'nothing');
  const total = eligible.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of eligible) {
    r -= entry.weight;
    if (r <= 0) return entry.item;
  }
  return 'nothing';
}
