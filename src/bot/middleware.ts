import type { Middleware } from 'grammy';
import type { Services } from '../services/index.js';
import type { BotContext } from './context.js';

/** Сохраняет или обновляет покупателя при любом обновлении из личного чата. */
export function touchUserMiddleware(services: Services): Middleware<BotContext> {
  return async (ctx, next) => {
    if (ctx.from) {
      await services.touchUser({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
      });
    }
    await next();
  };
}
