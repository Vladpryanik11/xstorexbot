import { describe, expect, it } from 'vitest';
import { createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string; url?: string };
const buttons = (payload: Record<string, unknown>): Btn[] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard.flat();

describe('/start', () => {
  it('без подписки: фото, подпись и 5 кнопок', async () => {
    const h = createHarness();
    await h.sendText('/start');
    const photo = h.calls.find((c) => c.method === 'sendPhoto');
    expect(photo).toBeDefined();
    expect(photo?.payload.caption).toBe('Привет');
    expect(photo?.payload.parse_mode).toBe('HTML');
    const b = buttons(photo?.payload ?? {});
    expect(b.map((x) => x.text)).toEqual([
      'Купить подписку',
      'Каталог приложений',
      'Отзывы',
      'О сервисе',
      'Поддержка',
    ]);
    expect(b[0]?.callback_data).toBe('menu:buy');
    expect(b[1]?.url).toBe(h.config.links.catalog);
    expect(b[2]?.url).toBe(h.config.links.reviews);
    expect(b[3]?.callback_data).toBe('menu:about');
    expect(b[4]?.url).toBe(h.config.links.support);
  });

  it('с активной подпиской: дата в подписи и кнопка «Моя подписка»', async () => {
    const h = createHarness();
    h.services.activeUntil.set(42, new Date('2026-12-15T12:00:00Z'));
    await h.sendText('/start');
    const photo = h.calls.find((c) => c.method === 'sendPhoto');
    expect(String(photo?.payload.caption).endsWith('\n\nПодписка активна до 15.12.2026')).toBe(
      true,
    );
    const b = buttons(photo?.payload ?? {});
    expect(b.at(-1)?.text).toBe('Моя подписка');
    expect(b.at(-1)?.callback_data).toBe('menu:my');
  });

  it('подписка в прошлом: кнопки «Моя подписка» нет', async () => {
    const h = createHarness();
    h.services.activeUntil.set(42, new Date('2026-11-01T12:00:00Z'));
    await h.sendText('/start');
    const photo = h.calls.find((c) => c.method === 'sendPhoto');
    expect(photo?.payload.caption).toBe('Привет');
    expect(buttons(photo?.payload ?? {}).map((x) => x.text)).not.toContain('Моя подписка');
  });

  it('второй /start отправляет file_id строкой', async () => {
    const h = createHarness();
    await h.sendText('/start');
    await h.sendText('/start');
    const photos = h.calls.filter((c) => c.method === 'sendPhoto');
    expect(photos).toHaveLength(2);
    expect(typeof photos[0]?.payload.photo).not.toBe('string');
    expect(photos[1]?.payload.photo).toBe('photo-file-id');
  });

  it('/start paid_abc ведёт себя как /start', async () => {
    const h = createHarness();
    await h.sendText('/start paid_abc');
    const photo = h.calls.find((c) => c.method === 'sendPhoto');
    expect(photo?.payload.caption).toBe('Привет');
  });

  it('menu:about отвечает на кнопку и отправляет текст', async () => {
    const h = createHarness();
    await h.press('menu:about');
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const msg = h.calls.find((c) => c.method === 'sendMessage');
    expect(msg?.payload.text).toBe('О сервисе');
    expect(msg?.payload.parse_mode).toBe('HTML');
  });

  it('в группе /start игнорируется', async () => {
    const h = createHarness();
    await h.sendText('/start', { chatType: 'group' });
    expect(h.calls).toHaveLength(0);
  });
});
