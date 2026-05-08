import { describe, it, expect } from 'vitest';
import { COLORS, FOREST_FLOOR, LIME_ACCENT } from './theme';

describe('IDV 2026 tokens (HARD-10)', () => {
  it('Forest Floor e #000D0A', () => {
    expect(FOREST_FLOOR).toBe('#000D0A');
    expect(COLORS['forest-floor'].DEFAULT).toBe('#000D0A');
  });

  it('Lime Accent e #01d5ac', () => {
    expect(LIME_ACCENT).toBe('#01d5ac');
    expect(COLORS['lime-accent'].DEFAULT).toBe('#01d5ac');
  });

  it('Lime tem variantes hover + muted', () => {
    expect(COLORS['lime-accent'].hover).toBeDefined();
    expect(COLORS['lime-accent'].muted).toBeDefined();
  });
});
