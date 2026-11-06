import { describe, expect, it } from 'vitest';
import { texts } from '../../../src/texts.js';
import { createHarness } from '../helpers/harness.js';

describe('служебные команды', () => {
  it('/paysupport отвечает текстом и кнопкой-ссылкой на поддержку', async () => {
    const h = createHarness();
    await h.sendText('/paysupport');
    const sent = h.calls.filter((c) => c.method === 'sendMessage');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.text).toBe(texts.paySupport);
    expect(sent[0]?.payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Поддержка', url: h.config.links.support }]],
    });
  });

  it('/terms отправляет ссылку на оферту', async () => {
    const h = createHarness();
    await h.sendText('/terms');
    const sent = h.calls.filter((c) => c.method === 'sendMessage');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.text).toBe(`Оферта сервиса: ${h.config.links.offer}`);
  });

  it('в группе бот молчит и не трогает пользователей', async () => {
    const h = createHarness();
    await h.sendText('/terms', { chatType: 'group' });
    expect(h.calls).toHaveLength(0);
    expect(h.services.users).toHaveLength(0);
  });

  it('любое сообщение в личке вызывает touchUser с данными отправителя', async () => {
    const h = createHarness();
    await h.sendText('привет', { from: { id: 7, first_name: 'Анна' } });
    expect(h.services.users).toEqual([{ id: 7, first_name: 'Анна', username: 'ivan' }]);
    expect(h.services.seenAt).toEqual([h.now.value]);
  });

  it('незнакомая кнопка получает ответ «устарела»', async () => {
    const h = createHarness();
    await h.press('garbage');
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
  });
});
