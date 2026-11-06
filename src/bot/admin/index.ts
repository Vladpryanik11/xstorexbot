import { type Composer, GrammyError, type Middleware } from 'grammy';
import type { Config } from '../../config.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';
import { AdminInput } from './input.js';
import { registerMenu, showAdminMenu } from './menu.js';
import { registerPlansSection } from './plans.js';

export { AdminInput, onInput } from './input.js';
export { showAdminMenu } from './menu.js';

export function isAdmin(config: Config, userId: number | undefined): boolean {
  return userId !== undefined && config.adminIds.includes(userId);
}

/**
 * Любая команда отменяет начатый ввод. Ставится в самом начале цепочки, до обработчиков команд,
 * которые не вызывают next().
 */
export function cancelInputOnCommand(config: Config, input: AdminInput): Middleware<BotContext> {
  return async (ctx, next) => {
    if (isAdmin(config, ctx.from?.id) && ctx.message?.text?.startsWith('/')) {
      input.clear(ctx.from?.id as number);
    }
    await next();
  };
}

/** Всё для админов в личном чате. Остальным команды и кнопки `adm:` не отвечают. */
export function registerAdmin<C extends BotContext>(
  priv: Composer<C>,
  deps: BotDeps,
  screens: Screens,
  input: AdminInput = new AdminInput(),
): void {
  const adm = priv.filter((ctx) => isAdmin(deps.config, ctx.from?.id));

  adm.command('admin', async (ctx) => {
    try {
      await ctx.deleteMessage();
    } catch (err) {
      if (!(err instanceof GrammyError)) throw err;
    }
    await showAdminMenu(ctx, screens);
  });

  registerMenu(adm, deps, screens, input);
  registerPlansSection(adm, deps, screens, input);
  // Разделы «Подписчики», «Рассылка» подключаются здесь (задачи 7, 11).

  // Последним: сообщение админа уходит обработчику его текущего ввода.
  adm.on('message', async (ctx, next) => {
    const state = input.get(ctx.from.id);
    if (!state || !(await input.dispatch(ctx, state))) await next();
  });
}
