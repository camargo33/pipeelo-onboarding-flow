/**
 * Pipeelo IDV 2026 — Single source of truth for color tokens
 *
 * Decision log (Phase 1, Plan 01-02):
 * - Forest Floor `#000D0A` background dark-first (HARD-10).
 * - Lime Accent `#01d5ac` accent (HARD-10 canonical — supersedes Felipe memory `#7ACC42`).
 * - If Felipe wants to revisit `#7ACC42`, open as gap closure post-Phase 1.
 *
 * Used by: tailwind.config.ts (extend.colors), tests, and any JS code that
 * needs hex literals (Storybook, e-mail templates, SVG fills, etc).
 */

export const FOREST_FLOOR = '#000D0A';
export const LIME_ACCENT = '#01d5ac';
export const LIME_ACCENT_HOVER = '#01b894';
export const LIME_ACCENT_MUTED = '#3eedc5';

export const COLORS = {
  'forest-floor': {
    DEFAULT: FOREST_FLOOR,
    50: '#0A1A16',
    100: '#0F2520',
    200: '#143028',
    300: '#1B3D32',
  },
  'lime-accent': {
    DEFAULT: LIME_ACCENT,
    hover: LIME_ACCENT_HOVER,
    muted: LIME_ACCENT_MUTED,
  },
} as const;
