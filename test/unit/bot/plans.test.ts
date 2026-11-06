import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { planScreenText } from '../../../src/domain/plans.js';
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
      { text: '‹ Назад', callback_data: 'menu:start' },
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

  it('plan:2 редактирует сообщение на экран тарифа', async () => {
    const h = createHarness();
    await h.press('plan:2', { messageId: 7 });
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const edit = h.calls.find((c) => c.method === 'editMessageText');
    expect(edit?.payload.message_id).toBe(7);
    expect(edit?.payload.text).toBe(
      planScreenText({ id: 2, days: 90, priceRub: 117000, priceStars: null }, h.config.links.offer),
    );
    expect(edit?.payload.parse_mode).toBe('HTML');
    expect(edit?.payload.link_preview_options).toEqual({ is_disabled: true });
    expect(buttons(edit?.payload ?? {})).toEqual([
      { text: '‹ Назад', callback_data: 'menu:plans' },
    ]);
  });

  it('menu:plans возвращает список в то же сообщение', async () => {
    const h = createHarness();
    await h.press('menu:plans', { messageId: 7 });
    const edit = h.calls.find((c) => c.method === 'editMessageText');
    expect(edit?.payload.message_id).toBe(7);
    expect(edit?.payload.text).toBe('Выберите срок подписки:');
    expect(buttons(edit?.payload ?? {})).toHaveLength(4);
  });

  it('menu:start отправляет главное меню', async () => {
    const h = createHarness();
    await h.press('menu:start');
    expect(h.calls.some((c) => c.method === 'sendPhoto')).toBe(true);
  });

  it.each(['plan:999', 'plan:abc'])('%s: кнопка устарела', async (data) => {
    const h = createHarness();
    await h.press(data);
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
    expect(h.calls.some((c) => c.method === 'editMessageText')).toBe(false);
  });

  it('тариф скрыт после показа списка', async () => {
    const h = createHarness();
    h.services.plans = h.services.plans.filter((p) => p.id !== 3);
    await h.press('plan:3');
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
    expect(h.calls.some((c) => c.method === 'editMessageText')).toBe(false);
  });

  it('ошибка «message is not modified» игнорируется', async () => {
    const h = createHarness();
    h.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === 'editMessageText') {
        throw new GrammyError(
          'x',
          { ok: false, error_code: 400, description: 'Bad Request: message is not modified' },
          method,
          payload,
        );
      }
      return prev(method, payload, signal);
    });
    await h.press('plan:2', { messageId: 7 });
    expect(
      h.calls.some((c) => c.method === 'sendMessage' && c.payload.text === texts.genericError),
    ).toBe(false);
  });
});
