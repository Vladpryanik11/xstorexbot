import { describe, expect, it } from 'vitest';
import type { BroadcastSummary } from '../../../src/broadcast/types.js';
import { createHarness } from '../helpers/harness.js';

type Btn = { text: string; callback_data?: string; url?: string };
const rows = (payload: Record<string, unknown>): Btn[][] =>
  (payload.reply_markup as { inline_keyboard: Btn[][] }).inline_keyboard;
type Calls = { method: string; payload: Record<string, unknown> }[];
const sent = (calls: Calls) => calls.filter((c) => c.method === 'sendMessage');
const lastSent = (calls: Calls) => sent(calls).at(-1)?.payload ?? {};

const admin = { id: 1 };
const photo = [{ file_id: 'f', file_unique_id: 'u', width: 1, height: 1 }];

function summary(over: Partial<BroadcastSummary>): BroadcastSummary {
  return {
    id: 7,
    status: 'DONE',
    total: 10,
    sent: 8,
    blocked: 1,
    failed: 1,
    pending: 0,
    createdAt: new Date('2026-11-05T09:00:00Z'),
    finishedAt: new Date('2026-11-05T09:30:00Z'),
    ...over,
  };
}

async function toPreview(h: ReturnType<typeof createHarness>, button: boolean) {
  await h.press('adm:bc', { from: admin });
  await h.press('adm:bc:new', { from: admin });
  await h.sendMessage({ message_id: 50, photo }, admin);
  if (button) {
    await h.press('adm:bc:btn', { from: admin });
    await h.sendText('Каталог | https://x.ru', { from: admin });
  } else {
    await h.press('adm:bc:nobtn', { from: admin });
  }
}

describe('раздел «Рассылка»', () => {
  it('без рассылок: «Рассылок ещё не было», Новая рассылка и Назад', async () => {
    const h = createHarness();
    await h.press('adm:bc', { from: admin });
    expect(lastSent(h.calls).text).toBe('Рассылок ещё не было');
    expect(rows(lastSent(h.calls))).toEqual([
      [{ text: 'Новая рассылка', callback_data: 'adm:bc:new' }],
      [{ text: '‹ Назад', callback_data: 'adm:menu' }],
    ]);
  });

  it('не админу кнопки рассылки не отвечают', async () => {
    const h = createHarness();
    await h.press('adm:bc');
    await h.press('adm:bc:send');
    expect(sent(h.calls)).toEqual([]);
    expect(h.broadcasts.calls).toEqual([]);
  });

  it('после рассылки: дата по Москве и отчёт', async () => {
    const h = createHarness();
    h.broadcasts.summary = summary({});
    await h.press('adm:bc', { from: admin });
    expect(lastSent(h.calls).text).toBe(
      'Последняя рассылка 05.11.2026\nРассылка завершена.\nДоставлено: 8\nЗаблокировали бота: 1\nОшибки: 1',
    );
    expect(rows(lastSent(h.calls))[0]).toEqual([
      { text: 'Новая рассылка', callback_data: 'adm:bc:new' },
    ]);
  });

  it('идёт: прогресс и кнопка «Остановить» с id', async () => {
    const h = createHarness();
    h.broadcasts.summary = summary({ status: 'RUNNING', finishedAt: null, pending: 1 });
    await h.press('adm:bc', { from: admin });
    expect(lastSent(h.calls).text).toBe('Рассылка: отправлено 10 из 10');
    expect(rows(lastSent(h.calls))[0]).toEqual([
      { text: 'Остановить', callback_data: 'adm:bc:stop:7' },
    ]);
    expect(
      rows(lastSent(h.calls))
        .flat()
        .map((b) => b.text),
    ).not.toContain('Новая рассылка');
  });

  it('путь целиком: сообщение, кнопка, предпросмотр, отправка', async () => {
    const h = createHarness();
    h.broadcasts.recipients = 1180;
    await h.press('adm:bc', { from: admin });
    await h.press('adm:bc:new', { from: admin });
    expect(lastSent(h.calls).text).toBe('Пришлите сообщение для рассылки');
    expect(h.adminInput.get(1)).toEqual({ kind: 'broadcastMessage' });

    await h.sendMessage({ message_id: 50, photo }, admin);
    expect(lastSent(h.calls).text).toBe('Добавить кнопку?');
    expect(rows(lastSent(h.calls))).toEqual([
      [
        { text: 'Добавить кнопку', callback_data: 'adm:bc:btn' },
        { text: 'Без кнопки', callback_data: 'adm:bc:nobtn' },
      ],
    ]);

    await h.press('adm:bc:btn', { from: admin });
    expect(lastSent(h.calls).text).toBe('Пришлите кнопку в виде: Название | https://адрес');

    await h.sendText('Каталог | https://x.ru', { from: admin });
    const copy = h.calls.find((c) => c.method === 'copyMessage');
    expect(copy?.payload).toMatchObject({ chat_id: 1, from_chat_id: 1, message_id: 50 });
    expect(rows(copy?.payload ?? {})).toEqual([[{ text: 'Каталог', url: 'https://x.ru' }]]);
    expect(lastSent(h.calls).text).toBe('Получателей: 1180');
    expect(rows(lastSent(h.calls))).toEqual([
      [
        { text: 'Отправить', callback_data: 'adm:bc:send' },
        { text: 'Отмена', callback_data: 'adm:bc:cancel' },
      ],
    ]);

    h.broadcasts.startResult = { ok: true, id: 3, total: 1180 };
    await h.press('adm:bc:send', { from: admin });
    expect(h.broadcasts.calls.filter((c) => c.method === 'start')).toEqual([
      {
        method: 'start',
        args: [
          {
            adminId: 1,
            sourceChatId: 1,
            sourceMessageId: 50,
            button: { text: 'Каталог', url: 'https://x.ru' },
          },
        ],
      },
    ]);
    expect(h.adminInput.get(1)).toBeUndefined();
    // Экран закрыт: кнопки «Остановить» нет ни у одного сообщения (она у сообщения отправителя).
    expect(JSON.stringify(sent(h.calls).map((c) => c.payload.reply_markup))).not.toContain(
      'adm:bc:stop',
    );
    expect(h.calls.some((c) => c.method === 'deleteMessage')).toBe(true);
  });

  it('стикер и часть альбома: отказ, ввод остаётся, следующий текст принимается', async () => {
    const h = createHarness();
    await h.press('adm:bc:new', { from: admin });
    const refusal = 'Пришлите одно сообщение: текст, фото, видео, GIF, файл, аудио или голосовое';
    await h.sendMessage({ sticker: { file_id: 's' } as never }, admin);
    expect(lastSent(h.calls).text).toBe(refusal);
    await h.sendMessage({ message_id: 51, photo, media_group_id: 'g' }, admin);
    expect(lastSent(h.calls).text).toBe(refusal);
    expect(h.adminInput.get(1)).toEqual({ kind: 'broadcastMessage' });
    expect(h.broadcasts.calls.filter((c) => c.method === 'start')).toEqual([]);

    await h.sendText('Привет всем', { from: admin });
    expect(lastSent(h.calls).text).toBe('Добавить кнопку?');
  });

  it('adm:bc:nobtn: предпросмотр без reply_markup', async () => {
    const h = createHarness();
    h.broadcasts.recipients = 5;
    await toPreview(h, false);
    const copy = h.calls.find((c) => c.method === 'copyMessage');
    expect(copy?.payload.reply_markup).toBeUndefined();
    expect(lastSent(h.calls).text).toBe('Получателей: 5');
  });

  it('неверная кнопка: подсказка формата, ввод остаётся', async () => {
    const h = createHarness();
    await h.press('adm:bc:new', { from: admin });
    await h.sendMessage({ message_id: 50, photo }, admin);
    await h.press('adm:bc:btn', { from: admin });
    await h.sendText('без адреса', { from: admin });
    expect(lastSent(h.calls).text).toBe(
      'Не получилось. Формат: Название | https://адрес, название до 64 символов',
    );
    expect(h.adminInput.get(1)?.kind).toBe('broadcastButton');
    expect(h.calls.some((c) => c.method === 'copyMessage')).toBe(false);
  });

  it('start вернул running: «Уже идёт рассылка…»', async () => {
    const h = createHarness();
    await toPreview(h, false);
    h.broadcasts.startResult = { ok: false, reason: 'running' };
    await h.press('adm:bc:send', { from: admin });
    expect(lastSent(h.calls).text).toBe('Уже идёт рассылка. Дождитесь окончания или остановите её');
  });

  it.each(['adm:bc:send', 'adm:bc:btn', 'adm:bc:nobtn'])(
    '%s без черновика: кнопка устарела, start не вызывается',
    async (data) => {
      const h = createHarness();
      await h.press(data, { from: admin });
      const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
      expect(answer?.payload.text).toBe('Кнопка устарела, нажмите /start');
      expect(h.broadcasts.calls.filter((c) => c.method === 'start')).toEqual([]);
      expect(sent(h.calls)).toEqual([]);
    },
  );

  it('adm:bc:cancel очищает черновик и показывает меню админки', async () => {
    const h = createHarness();
    await toPreview(h, true);
    expect(h.adminInput.get(1)?.kind).toBe('broadcastConfirm');
    await h.press('adm:bc:cancel', { from: admin });
    expect(h.adminInput.get(1)).toBeUndefined();
    expect(lastSent(h.calls).text).toBe('Админка');
  });

  it('adm:bc:stop:7 вызывает stop(1, 7)', async () => {
    const h = createHarness();
    await h.press('adm:bc:stop:7', { from: admin });
    expect(h.broadcasts.calls).toEqual([{ method: 'stop', args: [1, 7] }]);
  });

  it('stop вернул false: «Рассылка уже закончилась»', async () => {
    const h = createHarness();
    h.broadcasts.stopResult = false;
    await h.press('adm:bc:stop:7', { from: admin });
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe('Рассылка уже закончилась');
  });

  it('stop с негодным id: кнопка устарела, stop не вызывается', async () => {
    const h = createHarness();
    await h.press('adm:bc:stop:99999999999999999999', { from: admin });
    const answer = h.calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.text).toBe('Кнопка устарела, нажмите /start');
    expect(h.broadcasts.calls).toEqual([]);
  });
});
