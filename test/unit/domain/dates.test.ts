import { describe, expect, it } from 'vitest';
import { formatDateMsk } from '../../../src/domain/dates.js';

describe('formatDateMsk', () => {
  it('formats a date in Moscow time as DD.MM.YYYY', () => {
    expect(formatDateMsk(new Date('2026-12-15T20:59:00Z'))).toBe('15.12.2026');
  });

  it('rolls over to the next day at Moscow midnight', () => {
    expect(formatDateMsk(new Date('2026-12-15T21:00:00Z'))).toBe('16.12.2026');
  });
});
