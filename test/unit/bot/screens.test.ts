import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { planScreenText } from '../../../src/domain/plans.js';
import { texts } from '../../../src/texts.js';
import { type Call, createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string; url?: string };
const buttons = (payload: Record<string, unknown>): Btn[] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard.flat();
const deleted = (calls: Call[]): unknown[] =>
  calls.filter((c) => c.method === 'deleteMessage').map((c) => c.payload.message_id);
const indexOf = (calls: Call[], method: string): number =>
  calls.findIndex((c) => c.method === method);

describe('смена экранов', () => {
  it('кнопка меню без открытого экрана ничего не удаляет', async () => {
    const h = createHarness();
    await h.press('menu:buy', { photo: true });
    expect(deleted(h.calls)).toEqual([]);
    expect(h.calls.find((c) => c.method === 'sendMessage')?.payload.text).toBe(
      'Выберите срок подписки:',
    );
  });

  it('тариф: список удаляется, экран тарифа отправляется новым сообщением', async () => {
    const h = createHarness();
    await h.press('plan:2', { messageId: 7 });
    expect(h.calls.some((c) => c.method === 'editMessageText')).toBe(false);
    const del = h.calls.find((c) => c.method === 'deleteMessage');
    expect(del?.payload).toEqual({ chat_id: 42, message_id: 7 });
    const sent = h.calls.find((c) => c.method === 'sendMessage');
    expect(sent?.payload.text).toBe(
      planScreenText({ id: 2, days: 90, priceRub: 117000, priceStars: null }, h.config.links.offer),
    );
    expect(sent?.payload.parse_mode).toBe('HTML');
    expect(sent?.payload.link_preview_options).toEqual({ is_disabled: true });
    expect(buttons(sent?.payload ?? {})).toEqual([
      { text: '‹ Назад', callback_data: 'menu:plans' },
    ]);
    expect(indexOf(h.calls, 'deleteMessage')).toBeLessThan(indexOf(h.calls, 'sendMessage'));
  });

  it('«Назад» с экрана тарифа: экран удаляется, список отправляется', async () => {
    const h = createHarness();
    await h.press('menu:plans', { messageId: 8 });
    expect(deleted(h.calls)).toEqual([8]);
    expect(h.calls.find((c) => c.method === 'sendMessage')?.payload.text).toBe(
      'Выберите срок подписки:',
    );
  });

  it('«Назад» со списка: список удаляется, меню остаётся', async () => {
    const h = createHarness();
    await h.press('menu:close', { messageId: 7 });
    expect(deleted(h.calls)).toEqual([7]);
    expect(h.calls.some((c) => c.method === 'sendMessage' || c.method === 'sendPhoto')).toBe(false);
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
  });

  it('у списка и «О сервисе» кнопка «Назад» закрывает экран', async () => {
    const h = createHarness();
    await h.press('menu:buy', { photo: true });
    await h.press('menu:about', { photo: true });
    const [list, about] = h.calls.filter((c) => c.method === 'sendMessage');
    expect(buttons(list?.payload ?? {}).at(-1)).toEqual({
      text: '‹ Назад',
      callback_data: 'menu:close',
    });
    expect(buttons(about?.payload ?? {})).toEqual([
      { text: '‹ Назад', callback_data: 'menu:close' },
    ]);
  });

  it('кнопка меню при открытом экране удаляет его и открывает выбранный', async () => {
    const h = createHarness();
    await h.sendText('/start'); // меню 101
    await h.press('menu:buy', { messageId: 101, photo: true }); // список 102
    await h.press('menu:about', { messageId: 101, photo: true });
    expect(deleted(h.calls)).toContain(102);
    expect(deleted(h.calls)).not.toContain(101);
    expect(h.calls.at(-1)?.method).toBe('sendMessage');
    expect(h.calls.at(-1)?.payload.text).toBe('О сервисе');
  });

  it('повторное нажатие кнопки меню заменяет экран, а не копит его', async () => {
    const h = createHarness();
    await h.press('menu:buy', { photo: true }); // 101
    await h.press('menu:buy', { photo: true }); // 102
    expect(deleted(h.calls)).toEqual([101]);
  });

  it('экран, открытый с экрана, тоже запоминается и удаляется кнопкой меню', async () => {
    const h = createHarness();
    await h.press('menu:buy', { photo: true }); // список 101
    await h.press('plan:2', { messageId: 101 }); // тариф 102
    await h.press('menu:about', { photo: true });
    expect(deleted(h.calls)).toEqual([101, 102]);
  });

  it('закрытый экран забывается: следующая кнопка меню его не удаляет', async () => {
    const h = createHarness();
    await h.press('menu:buy', { photo: true }); // 101
    await h.press('menu:close', { messageId: 101 });
    await h.press('menu:about', { photo: true });
    expect(deleted(h.calls)).toEqual([101]);
  });

  it('повторный /start удаляет своё сообщение, старое меню и экран', async () => {
    const h = createHarness();
    await h.sendText('/start'); // сообщение 2, меню 101
    await h.press('menu:buy', { messageId: 101, photo: true }); // список 102
    await h.sendText('/start'); // сообщение 4
    expect(deleted(h.calls)).toEqual([2, 4, 101, 102]);
    const methods = h.calls.map((c) => c.method);
    expect(methods.lastIndexOf('sendPhoto')).toBeGreaterThan(methods.lastIndexOf('deleteMessage'));
  });

  it('первый /start удаляет только сообщение покупателя', async () => {
    const h = createHarness();
    await h.sendText('/start');
    expect(deleted(h.calls)).toEqual([2]);
  });

  it('после перезапуска нажатие на меню не удаляет меню', async () => {
    const h = createHarness();
    await h.press('menu:about', { messageId: 55, photo: true });
    expect(deleted(h.calls)).toEqual([]);
  });

  it('menu:start со старого экрана удаляет его и присылает меню', async () => {
    const h = createHarness();
    await h.press('menu:start', { messageId: 7 });
    expect(deleted(h.calls)).toEqual([7]);
    expect(h.calls.some((c) => c.method === 'sendPhoto')).toBe(true);
  });

  it('ошибка удаления (старше 48 часов) игнорируется, новый экран отправляется', async () => {
    const h = createHarness();
    h.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === 'deleteMessage') {
        throw new GrammyError(
          'x',
          { ok: false, error_code: 400, description: "Bad Request: message can't be deleted" },
          method,
          payload,
        );
      }
      return prev(method, payload, signal);
    });
    await h.press('plan:2', { messageId: 7 });
    const sent = h.calls.filter((c) => c.method === 'sendMessage');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.text).not.toBe(texts.genericError);
  });
});
