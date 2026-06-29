export interface Bindings {
  up:     string;
  down:   string;
  left:   string;
  right:  string;
  break1: string;
  break2: string;
  attack: string;
}

export const DEFAULT_BINDINGS: Bindings = {
  up:     'W',
  down:   'S',
  left:   'A',
  right:  'D',
  break1: 'Q',
  break2: 'E',
  attack: 'SPACE',
};

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem('zeroday_bindings');
    if (raw) return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_BINDINGS };
}

export function saveBindings(b: Bindings): void {
  localStorage.setItem('zeroday_bindings', JSON.stringify(b));
}
