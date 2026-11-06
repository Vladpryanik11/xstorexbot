import { describe, expect, it } from 'vitest';
import { extendEndsAt } from '../../../src/domain/subscription.js';

const now = new Date('2026-11-06T12:00:00Z');

describe('extendEndsAt', () => {
  it('считает от now, если подписки не было', () => {
    expect(extendEndsAt(null, now, 30)).toEqual(new Date('2026-12-06T12:00:00Z'));
  });

  it('считает от now, если подписка уже закончилась', () => {
    expect(extendEndsAt(new Date('2026-10-01T00:00:00Z'), now, 1)).toEqual(
      new Date('2026-11-07T12:00:00Z'),
    );
  });

  it('продлевает от будущей даты окончания', () => {
    expect(extendEndsAt(new Date('2026-12-15T10:00:00Z'), now, 30)).toEqual(
      new Date('2027-01-14T10:00:00Z'),
    );
  });
});
