import type { Composer } from 'grammy';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';

/** Блокировка бота покупателем и возврат: ведём blockedAt по my_chat_member. */
export function registerChatMember<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
): void {
  composer.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const from = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    };
    if (status === 'kicked') await deps.services.setBlocked(from, deps.clock());
    else if (status === 'member') await deps.services.setBlocked(from, null);
  });
}
