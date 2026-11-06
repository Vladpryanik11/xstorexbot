import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from '../config.js';
import type { Content } from '../content.js';
import type { Logger } from '../logger.js';
import type { Services } from '../services/index.js';
import { texts } from '../texts.js';
import { handleBotError } from './errors.js';
import { touchUserMiddleware } from './middleware.js';
import { type Clock, createOrdersChat } from './orders-chat.js';
import { registerServiceCommands } from './user/commands.js';

export type { Clock };

export interface BotDeps {
  config: Config;
  content: Content;
  services: Services;
  logger: Logger;
  clock: Clock;
}

export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const ordersChat = createOrdersChat({
    send: (text) => bot.api.sendMessage(deps.config.ordersChatId, text),
    clock: deps.clock,
    logger: deps.logger,
  });

  // Всё, что не личный чат (например, чат заказов), игнорируется целиком.
  const priv = bot.chatType('private');
  priv.use(touchUserMiddleware(deps.services));
  registerServiceCommands(priv, deps);
  // Обработчики кнопок этапа 2 добавляются выше; всё, что осталось, устарело.
  priv.on('callback_query:data', (ctx) => ctx.answerCallbackQuery({ text: texts.staleButton }));

  bot.catch((err) => handleBotError(err, deps, ordersChat));
  return bot;
}
