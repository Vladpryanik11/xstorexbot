import type { BotError } from 'grammy';
import { secretValues } from '../config.js';
import { redactSecrets } from '../logger.js';
import { texts } from '../texts.js';
import type { BotDeps } from './create-bot.js';
import type { OrdersChat } from './orders-chat.js';

export async function handleBotError(
  err: BotError,
  deps: BotDeps,
  ordersChat: OrdersChat,
): Promise<void> {
  const secrets = secretValues(deps.config);
  const cause = err.error;
  const message = redactSecrets(cause instanceof Error ? cause.message : String(cause), secrets);
  deps.logger.error({ err: cause }, 'ошибка при обработке обновления');

  const key = message.split('\n')[0] ?? '';
  await ordersChat.notifyError(key, `Ошибка: ${message}`.slice(0, 300));

  // Без ответа на callback_query у кнопки в клиенте бесконечно крутится индикатор.
  if (err.ctx.callbackQuery) {
    try {
      await err.ctx.answerCallbackQuery();
    } catch (answerErr) {
      deps.logger.error({ err: answerErr }, 'не удалось ответить на нажатие кнопки');
    }
  }

  if (err.ctx.chat?.type === 'private') {
    try {
      await err.ctx.reply(texts.genericError);
    } catch (replyErr) {
      deps.logger.error({ err: replyErr }, 'не удалось отправить сообщение об ошибке покупателю');
    }
  }
}
