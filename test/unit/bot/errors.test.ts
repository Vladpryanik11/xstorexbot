import { describe, expect, it } from 'vitest';
import { texts } from '../../../src/texts.js';
import { createHarness, TEST_ORDERS_CHAT_ID } from '../helpers/harness.js';

describe('обработка ошибок', () => {
  function failing() {
    const h = createHarness();
    h.services.touchUser = async () => {
      throw new Error(`db down ${h.config.botToken}`);
    };
    return h;
  }

  it('покупатель получает общее сообщение об ошибке', async () => {
    const h = failing();
    await h.sendText('/terms');
    const toUser = h.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === 42);
    expect(toUser).toHaveLength(1);
    expect(toUser[0]?.payload.text).toBe(texts.genericError);
  });

  it('в чат заказов уходит ошибка без токена', async () => {
    const h = failing();
    await h.sendText('/terms');
    const alert = h.calls.find(
      (c) => c.method === 'sendMessage' && c.payload.chat_id === TEST_ORDERS_CHAT_ID,
    );
    const text = String(alert?.payload.text);
    expect(text.startsWith('Ошибка:')).toBe(true);
    expect(text).toContain('db down');
    expect(text).toContain('[скрыто]');
    expect(text).not.toContain(h.config.botToken);
    expect(text).not.toContain(JSON.stringify(h.config.botToken).slice(1, -1));
  });

  it('текст для чата заказов обрезан до 300 символов', async () => {
    const h = createHarness();
    h.services.touchUser = async () => {
      throw new Error('x'.repeat(1000));
    };
    await h.sendText('/terms');
    const alert = h.calls.find(
      (c) => c.method === 'sendMessage' && c.payload.chat_id === TEST_ORDERS_CHAT_ID,
    );
    expect(String(alert?.payload.text).length).toBeLessThanOrEqual(300);
  });
});

describe('ошибка в обработчике кнопки', () => {
  function failingPress() {
    const h = createHarness();
    h.services.touchUser = async () => {
      throw new Error('db down');
    };
    return h;
  }

  it('callback_query получает ответ, чтобы не висел индикатор', async () => {
    const h = failingPress();
    await h.press('menu:about');
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    expect(
      h.calls.some((c) => c.method === 'sendMessage' && c.payload.text === texts.genericError),
    ).toBe(true);
  });

  it('сбой answerCallbackQuery не пробрасывается', async () => {
    const h = failingPress();
    h.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === 'answerCallbackQuery') throw new Error('network');
      return prev(method, payload, signal);
    });
    await expect(h.press('menu:about')).resolves.toBeUndefined();
  });
});
