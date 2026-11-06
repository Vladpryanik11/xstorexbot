import { describe, expect, it } from 'vitest';
import { cb, parsePlanId } from '../../../src/bot/callback-data.js';

describe('callback-data', () => {
  it('собирает данные кнопок', () => {
    expect(cb.menu('buy')).toBe('menu:buy');
    expect(cb.plan(2)).toBe('plan:2');
  });

  it('parsePlanId разбирает корректный id', () => {
    expect(parsePlanId('plan:2')).toBe(2);
    expect(parsePlanId('plan:15')).toBe(15);
  });

  it.each([
    'plan:abc',
    'plan:-1',
    'plan:',
    'plan:0',
    'plan:1.5',
    'plan:1x',
    'menu:buy',
    'plan:99999999999999999999',
  ])('parsePlanId(%s) → null', (data) => {
    expect(parsePlanId(data)).toBeNull();
  });
});
