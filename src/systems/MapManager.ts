// Tile type constants
export const T_FLOOR = 0;
export const T_HOLE  = 1; // impassable to entities, but projectiles fly over
export const T_BLOCK = 2; // breakable (3 hits)
export const T_CRATE = 3; // breakable (2 hits, drops item)
export const T_SOLID = 4; // indestructible wall, blocks everything

/** @deprecated use T_HOLE */
export const T_WALL = T_HOLE;

export interface MapData {
  width:  number;
  height: number;
  tiles:  number[][];
  blockHp: number[][];
  spawns: { col: number; row: number }[];
}

export type SpawnPoint = { col: number; row: number };

export function getRandomMap(playerCount: number): MapData {
  // Re-roll until all spawns are connected via T_FLOOR — preserves 4-fold symmetry
  for (let attempt = 0; attempt < 50; attempt++) {
    const map = generateMap(playerCount);
    if (spawnsConnected(map)) return map;
  }
  return generateMap(playerCount); // give up and return whatever we get
}

function buildBlockHp(tiles: number[][]): number[][] {
  return tiles.map(row => row.map(t => {
    if (t === T_BLOCK) return 3;
    if (t === T_CRATE) return 2;
    return 0;
  }));
}

// ---------------------------------------------------------------------------
// Procedural map generation — 4-fold symmetric (mirrors both axes)
// Random size: square or rectangle, scales with player count
// ---------------------------------------------------------------------------
function pickSize(playerCount: number): { W: number; H: number } {
  // Available sizes (even numbers only, divisible cleanly into the canvas)
  const pool = playerCount === 2 ? [10, 12, 14, 16, 18]
             : playerCount === 3 ? [14, 16, 18, 20, 22]
             :                     [16, 18, 20, 22, 24];
  const rand = () => pool[Math.floor(Math.random() * pool.length)];
  const W = rand();
  // 50% square, 50% rectangle (different height)
  if (Math.random() < 0.5) return { W, H: W };
  let H = rand();
  // Ensure it's actually different and ratio ≤ 2:1
  let attempts = 0;
  while ((H === W || Math.max(W, H) / Math.min(W, H) > 1.8) && attempts++ < 10) H = rand();
  return { W, H };
}

function generateMap(playerCount: number): MapData {
  const { W, H } = pickSize(playerCount);

  // Start with floor interior, indestructible border
  const tiles: number[][] = Array.from({ length: H }, (_, r) =>
    Array.from({ length: W }, (_, c) =>
      (r === 0 || r === H - 1 || c === 0 || c === W - 1) ? T_SOLID : T_FLOOR
    )
  );

  // Largest col/row index inside the quadrant (cols 1..qc, rows 1..qr)
  const qc = Math.floor((W - 1) / 2);
  const qr = Math.floor((H - 1) / 2);

  // Place tile with 4-fold symmetry. Handles even/odd widths correctly.
  const sym = (r: number, c: number, t: number) => {
    const mr = H - 1 - r;
    const mc = W - 1 - c;
    const set = (rr: number, cc: number) => {
      if (rr > 0 && rr < H - 1 && cc > 0 && cc < W - 1) tiles[rr][cc] = t;
    };
    set(r, c); set(r, mc); set(mr, c); set(mr, mc);
  };

  const rng = () => Math.random();

  // ── 1. T_SOLID pillar clusters for tactical cover ──────────────────────
  // Always place a center anchor and 1-2 mid-field clusters
  // Center cluster (mirrored onto all 4 center tiles for even-sized maps)
  const centerR = Math.floor(H / 2) - 1;
  const centerC = Math.floor(W / 2) - 1;
  sym(centerR, centerC, T_SOLID);
  sym(centerR, centerC + 1, T_SOLID);
  sym(centerR + 1, centerC, T_SOLID);
  sym(centerR + 1, centerC + 1, T_SOLID);

  // Mid-field pillar: 1 or 2 clusters, placed in the quadrant away from corners/center
  const numMidPillars = 1 + Math.floor(rng() * 2);
  for (let p = 0; p < numMidPillars; p++) {
    let pr: number, pc2: number, tries = 0;
    do {
      pr  = 3 + Math.floor(rng() * (qr - 5));
      pc2 = 3 + Math.floor(rng() * (qc - 5));
      tries++;
    } while (tries < 30 && tiles[pr][pc2] !== T_FLOOR);
    if (tiles[pr][pc2] !== T_FLOOR) continue;

    // 2×2 solid block, occasionally L-shaped
    sym(pr, pc2, T_SOLID);
    sym(pr + 1, pc2, T_SOLID);
    if (rng() > 0.3) sym(pr, pc2 + 1, T_SOLID);
    if (rng() > 0.5) sym(pr + 1, pc2 + 1, T_SOLID);
  }

  // ── 2. T_BLOCK — breakable barriers ───────────────────────────────────
  // Scale with quadrant interior area so larger maps stay proportionally dense.
  // Target ~20–32% of usable quadrant tiles as blocks.
  const quadrantArea = Math.max(1, (qr - 2) * (qc - 2));
  const numBlocks = Math.max(3, Math.round(quadrantArea * (0.20 + rng() * 0.12)));
  let placed = 0, tries = 0;
  while (placed < numBlocks && tries < numBlocks * 8) {
    const r = 2 + Math.floor(rng() * (qr - 2));
    const c = 2 + Math.floor(rng() * (qc - 2));
    if (tiles[r][c] === T_FLOOR) { sym(r, c, T_BLOCK); placed++; }
    tries++;
  }

  // ── 3. T_CRATE — loot containers ──────────────────────────────────────
  // Target ~8–14% of quadrant interior as crates.
  const numCrates = Math.max(2, Math.round(quadrantArea * (0.08 + rng() * 0.06)));
  placed = 0; tries = 0;
  while (placed < numCrates && tries < numCrates * 8) {
    const r = 1 + Math.floor(rng() * (qr - 1));
    const c = 1 + Math.floor(rng() * (qc - 1));
    if (tiles[r][c] === T_FLOOR) { sym(r, c, T_CRATE); placed++; }
    tries++;
  }
  // Guarantee at least 2 crates (1 quadrant = 4 on map) by scanning inward if random failed
  if (placed < 2) {
    outer: for (let r = 1; r < qr; r++) {
      for (let c = 1; c < qc; c++) {
        if (tiles[r][c] === T_FLOOR) {
          sym(r, c, T_CRATE);
          if (++placed >= 2) break outer;
        }
      }
    }
  }

  // ── 4. Spawn points (corners just inside the border) ──────────────────
  const allSpawns = [
    { col: 1, row: 1 },
    { col: W - 2, row: H - 2 },
    { col: W - 2, row: 1 },
    { col: 1, row: H - 2 },
  ];
  const spawns = allSpawns.slice(0, playerCount);

  // Clear a 2-tile radius around each spawn
  for (const s of spawns) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = s.row + dr, nc = s.col + dc;
        if (nr > 0 && nr < H - 1 && nc > 0 && nc < W - 1) {
          tiles[nr][nc] = T_FLOOR;
        }
      }
    }
  }

  return { width: W, height: H, tiles, blockHp: buildBlockHp(tiles), spawns };
}

// Returns true if every spawn can reach spawn[0] via T_FLOOR tiles.
function spawnsConnected(map: MapData): boolean {
  if (map.spawns.length < 2) return true;
  const { tiles, width: W, spawns } = map;
  const visited = new Set<number>();
  const key = (c: number, r: number) => r * W + c;
  const q = [spawns[0]];
  visited.add(key(spawns[0].col, spawns[0].row));
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]] as [number,number][]) {
      const nc = cur.col + dc, nr = cur.row + dr;
      const k = key(nc, nr);
      if (visited.has(k) || tiles[nr]?.[nc] !== T_FLOOR) continue;
      visited.add(k);
      q.push({ col: nc, row: nr });
    }
  }
  return spawns.every(s => visited.has(key(s.col, s.row)));
}
