// Mutable — set by GameScene before building entities/rendering
export let TILE_SIZE     = 48;
export let TILE_OFFSET_X = 0;
export function setTileSize(ts: number) { TILE_SIZE = ts; }
export function setTileOffsetX(ox: number) { TILE_OFFSET_X = ox; }

export const CANVAS_W = 1152; // 24 * 48 — max map width
export const CANVAS_H = 1212; // 24 * 48 + 60 score bar
export const MOVE_DURATION        = 250; // ms per tile (AI / tween base)
export const PLAYER_MOVE_DURATION = 63;  // ms per tile for human player (≈ 16 tiles/sec)
export const BLOCK_HIT_COOLDOWN = 55; // ms between clicks (18 CPS cap)

export const PLAYER_COLORS: Record<string, number> = {
  white:  0xeeeeee,
  red:    0xe05050,
  blue:   0x5080e0,
  yellow: 0xe0c040,
};

export const PLAYER_COLOR_NAMES = ['white', 'red', 'blue', 'yellow'] as const;
export type ColorName = typeof PLAYER_COLOR_NAMES[number];

export const SCORE_BAR_HEIGHT = 60;

export const MAP_SIZES: Record<number, { w: number; h: number }> = {
  2: { w: 16, h: 16 },
  3: { w: 20, h: 20 },
  4: { w: 24, h: 24 },
};

export const GUN_LINE_COLORS: Record<string, number> = {
  pistol:   0xffffaa,
  rifle:    0x44ffff,
  sniper:   0xffffff,
  laser:    0x44ff44,
};

export const WEAPON_COOLDOWNS: Record<string, number> = {
  knife:  400,
  mace:   700,
  sword:  550,
  pistol: 500,
  rifle:  250,
  sniper: 1400,
  laser:  900,
  bow:    700,
  rpg:    2000,
};

export const WEAPON_DAMAGES: Record<string, number> = {
  knife:  15,
  mace:   30,
  sword:  22,
  pistol: 25,
  rifle:  20,
  sniper: 70,
  laser:  35,
  bow:    30,
  rpg:    100,
};

export const WEAPON_RANGES: Record<string, number> = {
  pistol: 8,
  rifle:  14,
  sniper: 9999,
  laser:  9999,
  bow:    12,
  rpg:    6,
};

export const BOW_ARROW_SPEED = 8;  // tiles per second
export const RPG_SPEED        = 4; // tiles per second
export const RPG_AOE_MULT     = 0.5;

export const DROP_TABLE = [
  { item: 'pistol',  weight: 1 },
  { item: 'rifle',   weight: 1 },
  { item: 'sniper',  weight: 1 },
  { item: 'laser',   weight: 1 },
  { item: 'bow',     weight: 1 },
  { item: 'rpg',     weight: 1 },
  { item: 'mace',    weight: 1 },
  { item: 'sword',   weight: 1 },
  { item: 'medkit',  weight: 1 },
  { item: 'shield',  weight: 1 },
];

export const AI_CPS: Record<string, number> = {
  easy:   4,
  medium: 9,
  hard:   16,
};
