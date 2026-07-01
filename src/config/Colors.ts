import { getActiveTheme } from './UITheme';

// Resolved once at game load from the active campaign-stage theme.
export const C = getActiveTheme().colors;
