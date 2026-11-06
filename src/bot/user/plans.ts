import { type Composer, GrammyError, InlineKeyboard } from 'grammy';
import { planButtonLabel, planScreenText } from '../../domain/plans.js';
import { texts } from '../../texts.js';
import { cb, parsePlanId } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';

function isNotModified(err: unknown): boolean {
  return err instanceof GrammyError && err.description.includes('message is not modified');
}

export function registerPlans<C extends BotContext>(composer: Composer<C>, deps: BotDeps): void {
  async function planList(): Promise<{ text: string; keyboard: InlineKeyboard }> {
    const plans = await deps.services.listEnabledPlans();
    if (plans.length === 0) {
      return {
        text: texts.noPlans,
        keyboard: new InlineKeyboard().url(texts.buttons.support, deps.config.links.support),
      };
    }
    const keyboard = new InlineKeyboard();
    for (const plan of plans) keyboard.text(planButtonLabel(plan), cb.plan(plan.id)).row();
    keyboard.text(texts.buttons.back, cb.menu('start'));
    return { text: texts.planListTitle, keyboard };
  }

  composer.callbackQuery(cb.menu('buy'), async (ctx) => {
    await ctx.answerCallbackQuery();
    const { text, keyboard } = await planList();
    await ctx.reply(text, { reply_markup: keyboard });
  });

  composer.callbackQuery(cb.menu('plans'), async (ctx) => {
    await ctx.answerCallbackQuery();
    const { text, keyboard } = await planList();
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (err) {
      if (!isNotModified(err)) throw err;
    }
  });

  composer.callbackQuery(/^plan:/, async (ctx) => {
    const id = parsePlanId(ctx.callbackQuery.data);
    const plan = id === null ? null : await deps.services.getEnabledPlan(id);
    if (!plan) {
      await ctx.answerCallbackQuery({ text: texts.staleButton });
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(planScreenText(plan, deps.config.links.offer), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.menu('plans')),
      });
    } catch (err) {
      if (!isNotModified(err)) throw err;
    }
  });
}
