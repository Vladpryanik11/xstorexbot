import { type Composer, InlineKeyboard } from 'grammy';
import { baseStatsText } from '../../domain/admin.js';
import { texts } from '../../texts.js';
import { cb } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';
import type { AdminInput } from './input.js';

export async function showAdminMenu(ctx: BotContext, screens: Screens): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text(texts.admin.buttons.broadcast, cb.admin('bc'))
    .text(texts.admin.buttons.subscribers, cb.admin('subs'))
    .row()
    .text(texts.admin.buttons.plans, cb.admin('plans'))
    .text(texts.admin.buttons.base, cb.admin('base'));
  await screens.show(ctx, () => ctx.reply(texts.admin.menuTitle, { reply_markup: keyboard }));
}

export function registerMenu<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
  screens: Screens,
  input: AdminInput,
): void {
  composer.callbackQuery(cb.admin('menu'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.clear(ctx.from.id);
    await showAdminMenu(ctx, screens);
  });

  composer.callbackQuery(cb.admin('base'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.clear(ctx.from.id);
    const stats = await deps.admin.baseStats(deps.clock());
    await screens.show(ctx, () =>
      ctx.reply(baseStatsText(stats), {
        reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.admin('menu')),
      }),
    );
  });
}
