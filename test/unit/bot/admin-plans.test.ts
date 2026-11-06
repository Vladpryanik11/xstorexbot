import { describe, expect, it } from 'vitest';
import { texts } from '../../../src/texts.js';
import { createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string };
const rows = (payload: Record<string, unknown>): Btn[][] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard;
const sent = (calls: { method: string; payload: Record<string, unknown> }[]) =>
  calls.filter((c) => c.method === 'sendMessage');

const admin = { id: 1 };

describe('раздел «Тарифы»', () => {
  it('adm:plans показывает три строки и кнопки тарифов', async () => {
    const h = createHarness();
    await h.press('adm:plans', { from: admin });
    const screen = sent(h.calls)[0];
    expect(screen?.payload.text).toBe(
      [
        'Тарифы:',
        '30 дней · 490 ₽ · ⭐ не задана · включён',
        '90 дней · 1170 ₽ · ⭐ не задана · включён',
        '180 дней · 1740 ₽ · ⭐ не задана · включён',
      ].join('\n'),
    );
    expect(screen?.payload.parse_mode).toBeUndefined();
    expect(rows(screen?.payload ?? {})).toEqual([
      [{ text: '30 дней', callback_data: 'adm:plan:1' }],
      [{ text: '90 дней', callback_data: 'adm:plan:2' }],
      [{ text: '180 дней', callback_data: 'adm:plan:3' }],
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
  });

  it('не админу кнопки тарифов не отвечают', async () => {
    const h = createHarness();
    await h.press('adm:plan:1');
    expect(h.admin.calls).toEqual([]);
    expect(sent(h.calls)).toEqual([]);
  });

  it('карточка тарифа: строка и кнопки', async () => {
    const h = createHarness();
    await h.press('adm:plan:1', { from: admin });
    const card = sent(h.calls)[0];
    expect(card?.payload.text).toBe('30 дней · 490 ₽ · ⭐ не задана · включён');
    expect(rows(card?.payload ?? {})).toEqual([
      [
        { text: 'Цена ₽', callback_data: 'adm:plan:1:rub' },
        { text: 'Цена ⭐', callback_data: 'adm:plan:1:stars' },
      ],
      [{ text: 'Скрыть', callback_data: 'adm:plan:1:toggle' }],
      [{ text: '‹ Назад', callback_data: 'adm:plans' }],
    ]);
  });

  it('у скрытого тарифа кнопка «Включить»', async () => {
    const h = createHarness();
    const plan = h.admin.plans[0];
    if (plan) plan.enabled = false;
    await h.press('adm:plan:1', { from: admin });
    expect(rows(sent(h.calls)[0]?.payload ?? {})[1]).toEqual([
      { text: 'Включить', callback_data: 'adm:plan:1:toggle' },
    ]);
  });

  it('цена в рублях: приглашение, неверный ввод, верный ввод', async () => {
    const h = createHarness();
    await h.press('adm:plan:1:rub', { from: admin });
    expect(sent(h.calls)[0]?.payload.text).toBe(
      'Новая цена в рублях: целое число от 1 до 1 000 000',
    );
    expect(h.adminInput.get(1)).toEqual({ kind: 'priceRub', planId: 1 });

    await h.sendText('abc', { from: admin });
    expect(sent(h.calls)[1]?.payload.text).toBe('Нужно целое число от 1 до 1 000 000');
    expect(h.admin.calls.some((c) => c.method === 'setPlanPriceRub')).toBe(false);
    expect(h.adminInput.get(1)).toEqual({ kind: 'priceRub', planId: 1 });

    await h.sendText('590', { from: admin });
    expect(h.admin.calls.filter((c) => c.method === 'setPlanPriceRub')).toEqual([
      { method: 'setPlanPriceRub', args: [1, 1, 59000] },
    ]);
    expect(h.adminInput.get(1)).toBeUndefined();
    const last = sent(h.calls).at(-1);
    expect(last?.payload.text).toBe('30 дней · 490 ₽ · ⭐ не задана · включён');
    expect(rows(last?.payload ?? {})[0]?.[0]?.callback_data).toBe('adm:plan:1:rub');
  });

  it('цена в звёздах: приглашение, неверный ввод, «-» убирает цену, число задаёт', async () => {
    const h = createHarness();
    await h.press('adm:plan:1:stars', { from: admin });
    expect(sent(h.calls)[0]?.payload.text).toBe(
      'Новая цена в звёздах: целое число от 1 до 100 000 или «-», чтобы убрать',
    );

    await h.sendText('0', { from: admin });
    expect(sent(h.calls)[1]?.payload.text).toBe('Нужно целое число от 1 до 100 000 или «-»');
    expect(h.adminInput.get(1)).toEqual({ kind: 'priceStars', planId: 1 });

    await h.sendText('-', { from: admin });
    expect(h.admin.calls.filter((c) => c.method === 'setPlanPriceStars')).toEqual([
      { method: 'setPlanPriceStars', args: [1, 1, null] },
    ]);
    expect(h.adminInput.get(1)).toBeUndefined();

    await h.press('adm:plan:1:stars', { from: admin });
    await h.sendText('250', { from: admin });
    expect(h.admin.calls.filter((c) => c.method === 'setPlanPriceStars').at(-1)).toEqual({
      method: 'setPlanPriceStars',
      args: [1, 1, 250],
    });
  });

  it('«Скрыть» выключает тариф и показывает карточку с «Включить»', async () => {
    const h = createHarness();
    const plan = h.admin.plans[0];
    h.admin.setPlanEnabled = async (adminId, planId, enabled) => {
      h.admin.calls.push({ method: 'setPlanEnabled', args: [adminId, planId, enabled] });
      if (plan) plan.enabled = enabled;
    };
    await h.press('adm:plan:1:toggle', { from: admin });
    expect(h.admin.calls.filter((c) => c.method === 'setPlanEnabled')).toEqual([
      { method: 'setPlanEnabled', args: [1, 1, false] },
    ]);
    const card = sent(h.calls).at(-1);
    expect(card?.payload.text).toBe('30 дней · 490 ₽ · ⭐ не задана · скрыт');
    expect(rows(card?.payload ?? {})[1]).toEqual([
      { text: 'Включить', callback_data: 'adm:plan:1:toggle' },
    ]);
  });

  it.each(['adm:plan:999', 'adm:plan:999:rub', 'adm:plan:999:stars', 'adm:plan:999:toggle'])(
    '%s — «Кнопка устарела»',
    async (data) => {
      const h = createHarness();
      await h.press(data, { from: admin });
      const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
      expect(answer?.payload.text).toBe(texts.staleButton);
      expect(sent(h.calls)).toEqual([]);
      expect(h.admin.calls.some((c) => c.method.startsWith('setPlan'))).toBe(false);
      expect(h.adminInput.get(1)).toBeUndefined();
    },
  );

  it.each(['adm:plans', 'adm:plan:2', 'adm:menu'])(
    'переход %s сбрасывает начатый ввод цены',
    async (data) => {
      const h = createHarness();
      h.adminInput.set(1, { kind: 'priceRub', planId: 1 });
      await h.press(data, { from: admin });
      expect(h.adminInput.get(1)).toBeUndefined();
      await h.sendText('590', { from: admin });
      expect(h.admin.calls.some((c) => c.method === 'setPlanPriceRub')).toBe(false);
    },
  );

  it('«Скрыть» сбрасывает начатый ввод цены', async () => {
    const h = createHarness();
    h.adminInput.set(1, { kind: 'priceStars', planId: 1 });
    await h.press('adm:plan:1:toggle', { from: admin });
    expect(h.adminInput.get(1)).toBeUndefined();
  });
});
