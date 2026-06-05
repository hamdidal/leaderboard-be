import { describe, it, expect } from 'vitest';
import {
  getIsoWeekId,
  getNextIsoWeekId,
  getPreviousIsoWeekId,
  getWeekBounds,
} from '../src/lib/week';

describe('week utilities', () => {
  it('getNextIsoWeekId returns a different week after current week ends', () => {
    const current = '2026W23';
    const next = getNextIsoWeekId(current);
    expect(next).not.toBe(current);

    const { endsAt: currentEnd } = getWeekBounds(current);
    const { startsAt: nextStart } = getWeekBounds(next);
    expect(nextStart.getTime()).toBeGreaterThanOrEqual(currentEnd.getTime() - 86_400_000);
  });

  it('getIsoWeekId produces W-prefixed format', () => {
    const id = getIsoWeekId(new Date('2026-06-04'));
    expect(id).toMatch(/^\d{4}W\d{2}$/);
  });

  it('getPreviousIsoWeekId returns the week before getNextIsoWeekId', () => {
    const current = '2026W23';
    expect(getPreviousIsoWeekId(getNextIsoWeekId(current))).toBe(current);
    expect(getPreviousIsoWeekId(current)).not.toBe(current);
  });
});
