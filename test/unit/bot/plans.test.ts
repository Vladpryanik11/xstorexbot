import { describe, expect, it } from 'vitest';
import { texts } from '../../../src/texts.js';
import { createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string; url?: string; style?: string };
const buttons = (payload: Record<string, unknown>): Btn[] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard.flat();

describe('тарифы', () => {
  it('menu:buy показывает тарифы с ценой за месяц, выгодный — синий со звездой', async () => {
    const h = createHarness();
    await h.press('menu:buy');
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const msg = h.calls.find((c) => c.method === 'sendMessage');
    expect(msg?.payload.text).toBe('Выберите срок подписки:');
    expect(buttons(msg?.payload ?? {})).toEqual([
      { text: '490 ₽/мес. — 30 дней', callback_data: 'plan:1' },
      { text: '⭐ 290 ₽/мес. — 180 дней', callback_data: 'plan:3', style: 'primary' },
      { text: '390 ₽/мес. — 90 дней', callback_data: 'plan:2' },
      { text: '‹ Назад', callback_data: 'menu:close' },
    ]);
  });

  it('все тарифы скрыты: noPlans и кнопка «Поддержка»', async () => {
    const h = createHarness();
    h.services.plans = [];
    await h.press('menu:buy');
    const msg = h.calls.find((c) => c.method === 'sendMessage');
    expect(msg?.payload.text).toBe(texts.noPlans);
    expect(buttons(msg?.payload ?? {})).toEqual([
      { text: 'Поддержка', url: h.config.links.support },
    ]);
  });

  it.each(['plan:999', 'plan:abc'])('%s: кнопка устарела', async (data) => {
    const h = createHarness();
    await h.press(data);
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
    expect(h.calls.some((c) => c.method === 'sendMessage')).toBe(false);
    expect(h.calls.some((c) => c.method === 'deleteMessage')).toBe(false);
  });

  it('тариф скрыт после показа списка', async () => {
    const h = createHarness();
    h.services.plans = h.services.plans.filter((p) => p.id !== 3);
    await h.press('plan:3');
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
    expect(h.calls.some((c) => c.method === 'sendMessage')).toBe(false);
  });
});
