import { describe, expect, it } from 'vitest';
import { isAdmin, onInput } from '../../../src/bot/admin/index.js';
import { baseStatsText } from '../../../src/domain/admin.js';
import { texts } from '../../../src/texts.js';
import { createHarness, testConfig } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string };
const rows = (payload: Record<string, unknown>): Btn[][] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard;
const rowTexts = (payload: Record<string, unknown>): string[][] =>
  rows(payload).map((r) => r.map((b) => b.text));
const deleted = (calls: { method: string; payload: Record<string, unknown> }[]): unknown[] =>
  calls.filter((c) => c.method === 'deleteMessage').map((c) => c.payload.message_id);

const admin = { id: 1 };

describe('isAdmin', () => {
  it('только id из adminIds', () => {
    const config = testConfig();
    expect(isAdmin(config, 1)).toBe(true);
    expect(isAdmin(config, 42)).toBe(false);
    expect(isAdmin(config, undefined)).toBe(false);
  });
});

describe('/admin', () => {
  it('у админа удаляет команду и показывает меню', async () => {
    const h = createHarness();
    await h.sendText('/admin', { from: admin });
    expect(deleted(h.calls)).toContain(2);
    const menu = h.calls.find((c) => c.method === 'sendMessage');
    expect(menu?.payload.text).toBe('Админка');
    expect(menu?.payload.chat_id).toBe(1);
    expect(rowTexts(menu?.payload ?? {})).toEqual([
      ['Рассылка', 'Подписчики'],
      ['Тарифы', 'База'],
    ]);
    expect(
      rows(menu?.payload ?? {})
        .flat()
        .map((b) => b.callback_data),
    ).toEqual(['adm:bc', 'adm:subs', 'adm:plans', 'adm:base']);
  });

  it('не админу — тишина', async () => {
    const h = createHarness();
    await h.sendText('/admin', { from: { id: 42 } });
    expect(h.calls.some((c) => c.method === 'sendMessage')).toBe(false);
    expect(h.calls.some((c) => c.method === 'deleteMessage')).toBe(false);
  });
});

describe('кнопки админки', () => {
  it('adm:base от не админа — «Нет прав», счётчики не читаются', async () => {
    const h = createHarness();
    await h.press('adm:base');
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.noRights);
    expect(h.admin.calls).toEqual([]);
    expect(h.calls.some((c) => c.method === 'sendMessage')).toBe(false);
  });

  it('неизвестная кнопка adm: у админа — «Кнопка устарела», а не «Нет прав»', async () => {
    const h = createHarness();
    await h.press('adm:plan:1:toggle', { from: admin });
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.staleButton);
  });

  it('adm:bc:stop от не админа — «Нет прав», рассылка не трогается', async () => {
    const h = createHarness();
    await h.press('adm:bc:stop:1');
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe(texts.noRights);
    expect(h.broadcasts.calls).toEqual([]);
  });

  it('«База» показывает счётчики и «‹ Назад» → adm:menu', async () => {
    const h = createHarness();
    h.admin.stats = { users: 1250, reachable: 1180, blocked: 70, active: 312 };
    await h.press('adm:base', { from: admin, messageId: 55 });
    const screen = h.calls.find((c) => c.method === 'sendMessage');
    expect(screen?.payload.text).toBe(baseStatsText(h.admin.stats));
    expect(screen?.payload.parse_mode).toBeUndefined();
    expect(rows(screen?.payload ?? {})).toEqual([[{ text: '‹ Назад', callback_data: 'adm:menu' }]]);
    expect(deleted(h.calls)).toEqual([55]);
    expect(h.admin.calls).toEqual([{ method: 'baseStats', args: [h.now.value] }]);
  });

  it('adm:menu возвращает меню и сбрасывает ввод', async () => {
    const h = createHarness();
    h.adminInput.set(1, { kind: 'subscriberQuery' });
    await h.press('adm:menu', { from: admin, messageId: 56 });
    const menu = h.calls.find((c) => c.method === 'sendMessage');
    expect(menu?.payload.text).toBe('Админка');
    expect(deleted(h.calls)).toEqual([56]);
    expect(h.adminInput.get(1)).toBeUndefined();
  });
});

describe('ввод админа', () => {
  it('сообщение уходит обработчику текущего состояния', async () => {
    const h = createHarness();
    const seen: string[] = [];
    onInput(h.adminInput, 'subscriberQuery', async (ctx) => {
      seen.push(ctx.message?.text ?? '');
    });
    h.adminInput.set(1, { kind: 'subscriberQuery' });
    await h.sendText('ivan', { from: admin });
    expect(seen).toEqual(['ivan']);
  });

  it('команда отменяет начатый ввод', async () => {
    const h = createHarness();
    onInput(h.adminInput, 'subscriberQuery', async (ctx) => {
      await h.admin.findUserId({ username: ctx.message?.text ?? '' });
    });
    h.adminInput.set(1, { kind: 'subscriberQuery' });
    await h.sendText('/start', { from: admin });
    await h.sendText('ivan', { from: admin });
    expect(h.admin.calls.some((c) => c.method === 'findUserId')).toBe(false);
    expect(h.adminInput.get(1)).toBeUndefined();
  });

  it.each(['/terms', '/paysupport'])('%s отменяет начатый ввод', async (command) => {
    const h = createHarness();
    onInput(h.adminInput, 'subscriberQuery', async (ctx) => {
      await h.admin.findUserId({ username: ctx.message?.text ?? '' });
    });
    h.adminInput.set(1, { kind: 'subscriberQuery' });
    await h.sendText(command, { from: admin });
    await h.sendText('ivan', { from: admin });
    expect(h.admin.calls.some((c) => c.method === 'findUserId')).toBe(false);
    expect(h.adminInput.get(1)).toBeUndefined();
  });

  it('текст админа без состояния идёт в обычный поток', async () => {
    const h = createHarness();
    let called = false;
    onInput(h.adminInput, 'subscriberQuery', async () => {
      called = true;
    });
    await h.sendText('привет', { from: admin });
    expect(called).toBe(false);
    expect(h.services.users.map((u) => u.id)).toEqual([1]);
    expect(h.calls.some((c) => c.method === 'sendMessage')).toBe(false);
  });

  it('ввод не админа игнорируется', async () => {
    const h = createHarness();
    let called = false;
    onInput(h.adminInput, 'subscriberQuery', async () => {
      called = true;
    });
    h.adminInput.set(42, { kind: 'subscriberQuery' });
    await h.sendText('ivan', { from: { id: 42 } });
    expect(called).toBe(false);
  });
});
