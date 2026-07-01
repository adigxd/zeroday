// UI theme system. Each campaign stage can define its own look.
// The active theme is read from localStorage at game load — it never changes mid-session.

// ── Skin types ─────────────────────────────────────────────────────────────
// A skin controls HOW backgrounds and buttons are textured/painted.
// Add new skin types here as future stages require them.

export type CamoSkin = {
  type: 'camo';
  bgColors:     number[];  // near-black palette for scene backgrounds
  btnColors:    number[];  // dark palette for button fill
  bgBlockSize:  number;    // pixel-art block size for bg camo
  btnBlockSize: number;    // pixel-art block size for button camo
};

export type SolidSkin = {
  type: 'solid';
  // Uses colors.bgHex and colors.btnBg/btnHover directly — no extra config needed.
};

// Future skin types (e.g. 'noise', 'grid', 'gradient') can be added to this union.
export type UISkin = CamoSkin | SolidSkin;

// ── Theme interface ────────────────────────────────────────────────────────
export interface UITheme {
  id: string;
  name: string;
  /** Phaser/CSS color palette used by all UI scenes. */
  colors: {
    bgHex:     number;
    bg:        string;
    text:      string;
    subtext:   string;
    dim:       string;
    btnBg:     number;
    btnHover:  number;
    btnStroke: number;
    btnText:   string;
    rowBg:     number;
    rowStroke: number;
  };
  /** Controls the texture/pattern applied to backgrounds and buttons. */
  skin: UISkin;
}

// ── Stage 0 — "Swamp" ──────────────────────────────────────────────────────
// Dark desaturated browns, tans, and beiges. Murky, grounded, military feel.
// Skin: pixelated camo procedurally generated from dark olive-brown palettes.
const STAGE_0: UITheme = {
  id:   'stage0',
  name: 'Swamp',
  colors: {
    bgHex:     0x14100c,
    bg:        '#14100c',
    text:      '#d4c5a0',
    subtext:   '#8a7a60',
    dim:       '#5a4f3a',
    btnBg:     0x2a2318,
    btnHover:  0x3d3420,
    btnStroke: 0x6b5d43,
    btnText:   '#c8b890',
    rowBg:     0x1e1a12,
    rowStroke: 0x3d3326,
  },
  skin: {
    type:         'camo',
    bgColors:     [0x0c0907, 0x100d08, 0x0e0b07, 0x130f09],
    btnColors:    [0x1a1508, 0x26200d, 0x312815, 0x201b0b, 0x2e2712],
    bgBlockSize:  8,
    btnBlockSize: 6,
  },
};

// ── Theme registry ─────────────────────────────────────────────────────────
// Add future stage themes here. Key = localStorage stage value.
export const THEMES: Record<string, UITheme> = {
  stage0: STAGE_0,
};

// ── Active theme resolution ────────────────────────────────────────────────
const CAMPAIGN_STAGE_KEY = 'zeroday_campaign_stage';

export function getCampaignStage(): string {
  return localStorage.getItem(CAMPAIGN_STAGE_KEY) ?? 'stage0';
}

export function setCampaignStage(stage: string) {
  localStorage.setItem(CAMPAIGN_STAGE_KEY, stage);
}

/** Returns the UITheme for the current campaign stage. Falls back to stage0. */
export function getActiveTheme(): UITheme {
  return THEMES[getCampaignStage()] ?? STAGE_0;
}
