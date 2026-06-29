const THEME_KEY = 'zeroday_theme';
export type Theme = 'light' | 'dark';

export function loadTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'light';
}
export function saveTheme(t: Theme) {
  localStorage.setItem(THEME_KEY, t);
}

export interface ThemeColors {
  bgHex:      number;
  bg:         string;
  text:       string;
  subtext:    string;
  dim:        string;
  btnBg:      number;
  btnHover:   number;
  btnStroke:  number;
  btnText:    string;
  gridLine:   number;
  rowBg:      number;
  rowStroke:  number;
}

export function getColors(theme: Theme): ThemeColors {
  if (theme === 'dark') return {
    bgHex: 0x111111, bg: '#111111',
    text: '#ffffff', subtext: '#888888', dim: '#555555',
    btnBg: 0x222222, btnHover: 0x333333, btnStroke: 0x555555, btnText: '#dddddd',
    gridLine: 0x222222,
    rowBg: 0x1a1a1a, rowStroke: 0x333333,
  };
  return {
    bgHex: 0xf0ede6, bg: '#f0ede6',
    text: '#1a1a1a', subtext: '#555555', dim: '#888888',
    btnBg: 0xe0ddd6, btnHover: 0xd0cdc6, btnStroke: 0x999999, btnText: '#1a1a1a',
    gridLine: 0xdddddd,
    rowBg: 0xe0ddd6, rowStroke: 0xbbbbbb,
  };
}
