import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { AdminServices } from '../admin/index.js';
import type { Broadcasts } from '../broadcast/types.js';
import type { Config } from '../config.js';
import type { Content } from '../content.js';
import type { Logger } from '../logger.js';
import type { Services } from '../services/index.js';
import { texts } from '../texts.js';
import { AdminInput, cancelInputOnCommand, registerAdmin } from './admin/index.js';
import { handleBotError } from './errors.js';
import { touchUserMiddleware } from './middleware.js';
import { type Clock, createOrdersChat } from './orders-chat.js';
import { Screens } from './screens.js';
import { registerChatMember } from './user/chat-member.js';
import { registerServiceCommands } from './user/commands.js';
import { registerPlans } from './user/plans.js';
import { registerStart } from './user/start.js';

export type { Clock };

export interface BotDeps {
  config: Config;
  content: Content;
  services: Services;
  logger: Logger;
  clock: Clock;
  admin: AdminServices;
  broadcasts: Broadcasts;
}

export function createBot(
  token: string,
  deps: BotDeps,
  botInfo?: UserFromGetMe,
  adminInput: AdminInput = new AdminInput(),
): Bot {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const ordersChat = createOrdersChat({
    send: (text) => bot.api.sendMessage(deps.config.ordersChatId, text),
    clock: deps.clock,
    logger: deps.logger,
  });

  // Всё, что не личный чат (например, чат заказов), игнорируется целиком.
  const priv = bot.chatType('private');
  priv.use(touchUserMiddleware(deps.services, deps.clock));
  priv.use(cancelInputOnCommand(deps.config, adminInput));
  registerChatMember(priv, deps);
  registerServiceCommands(priv, deps);
  const screens = new Screens();
  registerAdmin(priv, deps, screens, adminInput);
  // Админские кнопки уже обработаны отфильтрованным композером; сюда доходят только не админы.
  priv.callbackQuery(/^adm:/, (ctx) => ctx.answerCallbackQuery({ text: texts.noRights }));
  registerStart(priv, deps, screens);
  registerPlans(priv, deps, screens);
  // Обработчики кнопок этапа 2 добавляются выше; всё, что осталось, устарело.
  priv.on('callback_query:data', (ctx) => ctx.answerCallbackQuery({ text: texts.staleButton }));

  bot.catch((err) => handleBotError(err, deps, ordersChat));
  return bot;
}
