import type { Middleware } from 'grammy';
import type { Services } from '../services/index.js';
import type { BotContext } from './context.js';
import type { Clock } from './orders-chat.js';

/** Обновляет покупателя, когда он пишет боту или нажимает кнопки (но не на my_chat_member). */
export function touchUserMiddleware(services: Services, clock: Clock): Middleware<BotContext> {
  return async (ctx, next) => {
    if (ctx.from && (ctx.message || ctx.callbackQuery)) {
      await services.touchUser(
        {
          id: ctx.from.id,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        },
        clock(),
      );
    }
    await next();
  };
}
