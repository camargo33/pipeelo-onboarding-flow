/**
 * Email tokens — IDV 2026
 *
 * Single source of truth para cores e tipografia em emails React Email.
 * Espelha src/styles/theme.ts mas isolado pra build de email
 * (Resend/render() não usa Tailwind do app principal).
 *
 * Decision log (Plan 05-01):
 * - forest #000D0A canonical (HARD-10).
 * - mint #01d5ac accent CTA (HARD-10 supersedes #7ACC42).
 * - urgent #ef4444 reservado para JarvisFailedAlert (incidente interno).
 */

export const EMAIL_COLORS = {
  forest: '#000D0A',
  mint: '#01d5ac',
  ink: '#ffffff',
  muted: '#94a3b8',
  urgent: '#ef4444',
  surface: '#0F2520',
} as const;

export const EMAIL_FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const EMAIL_TAILWIND_CONFIG = {
  theme: {
    extend: {
      colors: {
        forest: EMAIL_COLORS.forest,
        mint: EMAIL_COLORS.mint,
        ink: EMAIL_COLORS.ink,
        muted: EMAIL_COLORS.muted,
        urgent: EMAIL_COLORS.urgent,
        surface: EMAIL_COLORS.surface,
      },
      fontFamily: { sans: [EMAIL_FONT] },
    },
  },
};
