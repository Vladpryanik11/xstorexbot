import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../../src/domain/html.js';
import { formatRub, monthlyPriceRub } from '../../../src/domain/money.js';
import { bestPlanId, planButtonLabel, planScreenText } from '../../../src/domain/plans.js';

const p90 = { id: 2, days: 90, priceRub: 117000, priceStars: null };

describe('money', () => {
  it('formats kopecks as whole rubles', () => {
    expect(formatRub(117000)).toBe('1170 ₽');
  });

  it('computes the rounded monthly price', () => {
    expect(monthlyPriceRub(49000, 30)).toBe(490);
    expect(monthlyPriceRub(117000, 90)).toBe(390);
    expect(monthlyPriceRub(174000, 180)).toBe(290);
    expect(monthlyPriceRub(100000, 90)).toBe(333);
  });
});

describe('plans', () => {
  it('builds the button label: monthly price, then days', () => {
    expect(planButtonLabel(p90, false)).toBe('390 ₽/мес. — 90 дней');
    expect(planButtonLabel({ id: 1, days: 30, priceRub: 49000, priceStars: null }, false)).toBe(
      '490 ₽/мес. — 30 дней',
    );
  });

  it('marks the best plan with a star', () => {
    expect(planButtonLabel({ id: 3, days: 180, priceRub: 174000, priceStars: null }, true)).toBe(
      '⭐ 290 ₽/мес. — 180 дней',
    );
  });

  it('best plan: lowest monthly price, longer on tie, none for fewer than two plans', () => {
    const p = (id: number, days: number, priceRub: number) => ({
      id,
      days,
      priceRub,
      priceStars: null,
    });
    expect(bestPlanId([p(1, 30, 49000), p(2, 90, 117000), p(3, 180, 174000)])).toBe(3);
    expect(bestPlanId([p(1, 30, 49000), p(2, 90, 150000)])).toBe(1);
    expect(bestPlanId([p(1, 30, 30000), p(2, 60, 60000)])).toBe(2);
    expect(bestPlanId([p(1, 30, 49000)])).toBeNull();
    expect(bestPlanId([])).toBeNull();
  });

  it('builds the plan screen with an escaped offer link', () => {
    expect(planScreenText(p90, 'https://telegra.ph/oferta?a=1&b=2')).toBe(
      'Подписка: 90 дней\nСтоимость: 1170 ₽ (390 ₽ в месяц)\n\n' +
        'Оплачивая, вы принимаете условия <a href="https://telegra.ph/oferta?a=1&amp;b=2">оферты</a>.',
    );
  });

  it('omits the per-month line for 30 days', () => {
    expect(
      planScreenText({ id: 1, days: 30, priceRub: 49000, priceStars: null }, 'https://x.y'),
    ).toContain('Стоимость: 490 ₽\n');
  });
});

describe('escapeHtml', () => {
  it('escapes & < > "', () => {
    expect(escapeHtml('a&b<c>"d"')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
  });
});
