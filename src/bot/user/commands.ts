import { type Composer, InlineKeyboard } from 'grammy';
import { texts } from '../../texts.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';

export function registerServiceCommands<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
): void {
  composer.command('paysupport', (ctx) =>
    ctx.reply(texts.paySupport, {
      reply_markup: new InlineKeyboard().url(texts.buttons.support, deps.config.links.support),
    }),
  );
  composer.command('terms', (ctx) => ctx.reply(texts.terms(deps.config.links.offer)));
}
