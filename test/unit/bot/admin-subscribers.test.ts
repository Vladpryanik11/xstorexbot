import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import type { SubscriberCard } from '../../../src/domain/admin.js';
import { createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string; url?: string };
const rows = (payload: Record<string, unknown>): Btn[][] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard;
const sent = (calls: { method: string; payload: Record<string, unknown> }[]) =>
  calls.filter((c) => c.method === 'sendMessage');

const admin = { id: 1 };

function card(endsAt: Date | null): SubscriberCard {
  return {
    id: 42,
    firstName: 'Иван',
    username: 'ivan',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    lastSeenAt: new Date('2026-11-05T10:00:00Z'),
    blockedAt: null,
    endsAt,
    payments: [],
  };
}

const ACTIVE = new Date('2026-12-15T12:00:00Z');

function failBuyerSend(h: ReturnType<typeof createHarness>, code: number, description: string) {
  h.bot.api.config.use(async (prev, method, payload) => {
    if (method === 'sendMessage' && (payload as { chat_id: number }).chat_id === 42) {
      throw new GrammyError('x', { ok: false, error_code: code, description }, method, payload);
    }
    return prev(method, payload);
  });
}

describe('раздел «Подписчики»', () => {
  it('adm:subs просит username или ID и ставит ввод', async () => {
    const h = createHarness();
    await h.press('adm:subs', { from: admin });
    expect(sent(h.calls)[0]?.payload.text).toBe('Пришлите @username или Telegram ID');
    expect(h.adminInput.get(1)).toEqual({ kind: 'subscriberQuery' });
    expect(rows(sent(h.calls)[0]?.payload ?? {})).toEqual([
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
  });

  it('не админу кнопки подписчиков не отвечают', async () => {
    const h = createHarness();
    await h.press('adm:subs');
    await h.press('adm:sub:42:end');
    expect(sent(h.calls)).toEqual([]);
    expect(h.admin.calls).toEqual([]);
  });

  it('@Ivan: ищет по username и показывает карточку с кнопками', async () => {
    const h = createHarness();
    h.admin.foundUserId = 42;
    h.admin.card = card(ACTIVE);
    await h.press('adm:subs', { from: admin });
    await h.sendText('@Ivan', { from: admin });
    expect(h.admin.calls.find((c) => c.method === 'findUserId')?.args).toEqual([
      { username: 'Ivan' },
    ]);
    const screen = sent(h.calls)[1];
    expect(screen?.payload.text).toContain('Иван (@ivan), ID 42');
    expect(rows(screen?.payload ?? {})).toEqual([
      [{ text: 'Добавить дни', callback_data: 'adm:sub:42:days' }],
      [{ text: 'Завершить подписку', callback_data: 'adm:sub:42:end' }],
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
    expect(h.adminInput.get(1)).toBeUndefined();
  });

  it('неверный формат запроса: подсказка, ввод продолжается', async () => {
    const h = createHarness();
    await h.press('adm:subs', { from: admin });
    await h.sendText('??', { from: admin });
    expect(sent(h.calls)[1]?.payload.text).toBe('Пришлите @username или числовой Telegram ID');
    expect(h.admin.calls.some((c) => c.method === 'findUserId')).toBe(false);
    expect(h.adminInput.get(1)).toEqual({ kind: 'subscriberQuery' });
  });

  it('неизвестный: «Не найден», следующий ввод снова ищет', async () => {
    const h = createHarness();
    await h.press('adm:subs', { from: admin });
    await h.sendText('12345', { from: admin });
    expect(sent(h.calls)[1]?.payload.text).toBe(
      'Не найден. Человек должен хотя бы раз написать боту',
    );
    expect(h.adminInput.get(1)).toEqual({ kind: 'subscriberQuery' });

    h.admin.foundUserId = 42;
    h.admin.card = card(null);
    await h.sendText('42', { from: admin });
    const finds = h.admin.calls.filter((c) => c.method === 'findUserId');
    expect(finds.map((c) => c.args)).toEqual([[{ id: 12345 }], [{ id: 42 }]]);
    expect(sent(h.calls)[2]?.payload.text).toContain('Иван (@ivan), ID 42');
  });

  it('у подписчика без активной подписки нет кнопки «Завершить подписку»', async () => {
    const h = createHarness();
    h.admin.card = card(new Date('2026-10-01T12:00:00Z'));
    await h.press('adm:sub:42', { from: admin });
    expect(rows(sent(h.calls)[0]?.payload ?? {})).toEqual([
      [{ text: 'Добавить дни', callback_data: 'adm:sub:42:days' }],
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
  });

  it('неизвестный id в кнопке: ответ «устарела», ввод сброшен', async () => {
    const h = createHarness();
    h.adminInput.set(1, { kind: 'subscriberQuery' });
    h.admin.card = null;
    await h.press('adm:sub:42:days', { from: admin });
    expect(sent(h.calls)).toEqual([]);
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    expect(h.adminInput.get(1)).toBeUndefined();
  });

  it('adm:sub:42:days просит число; неверно и верно', async () => {
    const h = createHarness();
    h.admin.card = card(ACTIVE);
    await h.press('adm:sub:42:days', { from: admin });
    expect(sent(h.calls)[0]?.payload.text).toBe('Сколько дней добавить? Целое число от 1 до 3650');
    expect(h.adminInput.get(1)).toEqual({ kind: 'addDays', userId: 42 });

    await h.sendText('0', { from: admin });
    expect(sent(h.calls)[1]?.payload.text).toBe('Нужно целое число от 1 до 3650');
    expect(h.admin.calls.some((c) => c.method === 'addDays')).toBe(false);
    expect(h.adminInput.get(1)).toEqual({ kind: 'addDays', userId: 42 });

    await h.sendText('30', { from: admin });
    expect(h.admin.calls.find((c) => c.method === 'addDays')?.args).toEqual([
      1,
      42,
      30,
      h.now.value,
    ]);
    const toBuyer = sent(h.calls)[2];
    expect(toBuyer?.payload.chat_id).toBe(42);
    expect(toBuyer?.payload.text).toBe('Подписка продлена до 06.12.2026');
    expect(rows(toBuyer?.payload ?? {})).toEqual([
      [{ text: 'Вступить в канал', url: 'https://t.me/+invite' }],
    ]);
    expect(sent(h.calls)[3]?.payload.text).toContain('Иван (@ivan), ID 42');
    expect(h.adminInput.get(1)).toBeUndefined();
  });

  it('покупатель заблокировал бота: markBlocked, карточка показана, админу ошибка не уходит', async () => {
    const h = createHarness();
    h.admin.card = card(ACTIVE);
    failBuyerSend(h, 403, 'Forbidden: bot was blocked by the user');
    await h.press('adm:sub:42:days', { from: admin });
    await h.sendText('30', { from: admin });
    expect(h.services.blocked.get(42)).toEqual(h.now.value);
    const toAdmin = h.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === 1);
    expect(toAdmin.some((c) => String(c.payload.text).includes('Иван (@ivan)'))).toBe(true);
    expect(toAdmin.some((c) => c.payload.text === 'Что-то пошло не так, попробуйте ещё раз.')).toBe(
      false,
    );
  });

  it('другая ошибка отправки покупателю: карточка показана, ошибка идёт в общий обработчик', async () => {
    const h = createHarness();
    h.admin.card = card(ACTIVE);
    failBuyerSend(h, 400, 'Bad Request: boom');
    await h.press('adm:sub:42:days', { from: admin });
    await h.sendText('30', { from: admin });
    expect(h.services.blocked.has(42)).toBe(false);
    const texts = sent(h.calls).map((c) => String(c.payload.text));
    expect(texts.some((t) => t.includes('Иван (@ivan)'))).toBe(true);
    expect(texts).toContain('Что-то пошло не так, попробуйте ещё раз.');
  });

  it('завершение: подтверждение, затем endSubscription и карточка без кнопки', async () => {
    const h = createHarness();
    h.admin.card = card(ACTIVE);
    await h.press('adm:sub:42:end', { from: admin });
    const confirm = sent(h.calls)[0];
    expect(confirm?.payload.text).toBe('Завершить подписку @ivan сейчас? Деньги не возвращаются');
    expect(rows(confirm?.payload ?? {})).toEqual([
      [
        { text: 'Да, завершить', callback_data: 'adm:sub:42:endok' },
        { text: 'Отмена', callback_data: 'adm:sub:42' },
      ],
    ]);
    expect(h.admin.calls.some((c) => c.method === 'endSubscription')).toBe(false);

    h.admin.card = card(h.now.value);
    await h.press('adm:sub:42:endok', { from: admin });
    expect(h.admin.calls.find((c) => c.method === 'endSubscription')?.args).toEqual([
      1,
      42,
      h.now.value,
    ]);
    expect(rows(sent(h.calls)[1]?.payload ?? {})).toEqual([
      [{ text: 'Добавить дни', callback_data: 'adm:sub:42:days' }],
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
  });

  it('подтверждение без username использует имя', async () => {
    const h = createHarness();
    h.admin.card = { ...card(ACTIVE), username: null };
    await h.press('adm:sub:42:end', { from: admin });
    expect(sent(h.calls)[0]?.payload.text).toBe(
      'Завершить подписку Иван сейчас? Деньги не возвращаются',
    );
  });

  it('переход по карточке отменяет начатый ввод дней', async () => {
    const h = createHarness();
    h.admin.card = card(ACTIVE);
    h.adminInput.set(1, { kind: 'addDays', userId: 42 });
    await h.press('adm:sub:42', { from: admin });
    expect(h.adminInput.get(1)).toBeUndefined();
  });
});
