import { describe, expect, it } from 'vitest';
import {
  baseStatsText,
  parseButton,
  parseDays,
  parseRubToKopecks,
  parseStars,
  parseSubscriberQuery,
  planAdminLine,
  type SubscriberCard,
  subscriberCardText,
} from '../../../src/domain/admin.js';

const now = new Date('2026-11-06T12:00:00Z');

function card(patch: Partial<SubscriberCard> = {}): SubscriberCard {
  return {
    id: 1,
    firstName: 'Иван',
    username: null,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    lastSeenAt: now,
    blockedAt: null,
    endsAt: null,
    payments: [],
    ...patch,
  };
}

describe('planAdminLine', () => {
  it('без звёздной цены, включён', () => {
    expect(
      planAdminLine({ id: 1, days: 30, priceRub: 49000, priceStars: null, enabled: true }),
    ).toBe('30 дней · 490 ₽ · ⭐ не задана · включён');
  });

  it('со звёздной ценой, скрыт', () => {
    expect(
      planAdminLine({ id: 3, days: 180, priceRub: 174000, priceStars: 990, enabled: false }),
    ).toBe('180 дней · 1740 ₽ · ⭐ 990 · скрыт');
  });
});

describe('subscriberCardText', () => {
  it('полная карточка', () => {
    expect(
      subscriberCardText(
        card({
          id: 123456789,
          username: 'ivan',
          endsAt: new Date('2026-12-15T10:00:00Z'),
          payments: [
            { createdAt: now, provider: 'STARS', amount: 290, currency: 'XTR', status: 'PAID' },
            {
              createdAt: new Date('2026-11-01T10:00:00Z'),
              provider: 'MANUAL',
              amount: 0,
              currency: 'RUB',
              status: 'PAID',
            },
          ],
        }),
        now,
      ),
    ).toBe(
      'Иван (@ivan), ID 123456789\nПервый визит: 01.11.2026, последний: 06.11.2026\n' +
        'Подписка до 15.12.2026\nЗаблокировал бота: нет\n\nПлатежи:\n' +
        '06.11.2026 · Stars · 290 ⭐ · оплачен\n01.11.2026 · вручную · 0 ₽ · оплачен',
    );
  });

  it('без username, без подписки и платежей', () => {
    expect(subscriberCardText(card(), now)).toBe(
      'Иван, ID 1\nПервый визит: 01.11.2026, последний: 06.11.2026\n' +
        'Подписки нет\nЗаблокировал бота: нет\n\nПлатежей нет',
    );
  });

  it('подписка закончилась', () => {
    expect(subscriberCardText(card({ endsAt: new Date('2026-11-01T10:00:00Z') }), now)).toContain(
      'Подписка закончилась 01.11.2026',
    );
  });

  it('заблокировал бота', () => {
    expect(subscriberCardText(card({ blockedAt: now }), now)).toContain('Заблокировал бота: да');
  });

  it.each([
    ['PLATEGA', 'Platega'],
    ['STARS', 'Stars'],
    ['MANUAL', 'вручную'],
  ] as const)('провайдер %s', (provider, name) => {
    const text = subscriberCardText(
      card({
        payments: [{ createdAt: now, provider, amount: 49000, currency: 'RUB', status: 'PAID' }],
      }),
      now,
    );
    expect(text).toContain(`06.11.2026 · ${name} · 490 ₽ · оплачен`);
  });

  it.each([
    ['PENDING', 'ожидает'],
    ['PAID', 'оплачен'],
    ['CANCELED', 'отменён'],
    ['EXPIRED', 'истёк'],
    ['REFUNDED', 'возвращён'],
    ['CHARGEBACK', 'чарджбэк'],
  ] as const)('статус %s', (status, name) => {
    const text = subscriberCardText(
      card({
        payments: [{ createdAt: now, provider: 'PLATEGA', amount: 100, currency: 'RUB', status }],
      }),
      now,
    );
    expect(text).toContain(`1 ₽ · ${name}`);
  });
});

describe('baseStatsText', () => {
  it('форматирует счётчики', () => {
    expect(baseStatsText({ users: 1250, reachable: 1180, blocked: 70, active: 312 })).toBe(
      'Пользователей: 1250\nПолучат рассылку: 1180\nЗаблокировали бота: 70\nС активной подпиской: 312',
    );
  });
});

describe('parseDays', () => {
  it.each([
    ['1', 1],
    ['3650', 3650],
    [' 30 ', 30],
    ['0', null],
    ['3651', null],
    ['1.5', null],
    ['-3', null],
    ['abc', null],
    ['', null],
  ])('%j -> %j', (text, expected) => {
    expect(parseDays(text)).toBe(expected);
  });
});

describe('parseRubToKopecks', () => {
  it.each([
    ['490', 49000],
    ['1 000', 100000],
    ['1000000', 100000000],
    ['1', 100],
    ['0', null],
    ['1000001', null],
    ['4.5', null],
    ['', null],
    ['abc', null],
  ])('%j -> %j', (text, expected) => {
    expect(parseRubToKopecks(text)).toBe(expected);
  });
});

describe('parseStars', () => {
  it.each([
    ['-', 'clear'],
    ['1', 1],
    ['100000', 100000],
    ['100001', null],
    ['0', null],
    ['1.5', null],
    ['abc', null],
    ['', null],
  ])('%j -> %j', (text, expected) => {
    expect(parseStars(text)).toBe(expected);
  });
});

describe('parseButton', () => {
  it('разбирает название и адрес', () => {
    expect(parseButton('Каталог | https://x.ru')).toEqual({ text: 'Каталог', url: 'https://x.ru' });
  });

  it('делит по первому |', () => {
    expect(parseButton('A | https://x.ru/?a=b|c')).toEqual({
      text: 'A',
      url: 'https://x.ru/?a=b|c',
    });
  });

  it('принимает название в 64 символа', () => {
    const name = 'я'.repeat(64);
    expect(parseButton(`${name}|https://x.ru`)).toEqual({ text: name, url: 'https://x.ru' });
  });

  it.each([
    '| https://x.ru',
    'Текст | http://x.ru',
    'Текст',
    'Текст | https://x .ru',
    'Текст | ',
    `${'я'.repeat(65)} | https://x.ru`,
  ])('%j -> null', (text) => {
    expect(parseButton(text)).toBeNull();
  });
});

describe('parseSubscriberQuery', () => {
  it.each([
    ['@IVAN', { username: 'IVAN' }],
    ['ivan_1', { username: 'ivan_1' }],
    ['123', { id: 123 }],
    [' 123456789012345 ', { id: 123456789012345 }],
    ['иван', null],
    ['abc', null],
    ['a'.repeat(33), null],
    ['', null],
  ])('%j -> %j', (text, expected) => {
    expect(parseSubscriberQuery(text)).toEqual(expected);
  });
});
