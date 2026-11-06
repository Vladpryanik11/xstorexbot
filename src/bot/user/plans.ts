import { type Composer, InlineKeyboard } from 'grammy';
import {
  bestPlanId,
  orderPlansForList,
  planButtonLabel,
  planScreenText,
} from '../../domain/plans.js';
import { texts } from '../../texts.js';
import { cb, parsePlanId } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';

export function registerPlans<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
  screens: Screens,
): void {
  async function planList(): Promise<{ text: string; keyboard: InlineKeyboard }> {
    const plans = await deps.services.listEnabledPlans();
    if (plans.length === 0) {
      return {
        text: texts.noPlans,
        keyboard: new InlineKeyboard().url(texts.buttons.support, deps.config.links.support),
      };
    }
    const keyboard = new InlineKeyboard();
    const bestId = bestPlanId(plans);
    for (const plan of orderPlansForList(plans, bestId)) {
      const best = plan.id === bestId;
      keyboard.text(planButtonLabel(plan, best), cb.plan(plan.id));
      if (best) keyboard.style('primary');
      keyboard.row();
    }
    keyboard.text(texts.buttons.back, cb.menu('close'));
    return { text: texts.planListTitle, keyboard };
  }

  // «Купить подписку» из меню и «‹ Назад» с экрана тарифа: одинаково показывают список.
  composer.callbackQuery([cb.menu('buy'), cb.menu('plans')], async (ctx) => {
    await ctx.answerCallbackQuery();
    const { text, keyboard } = await planList();
    await screens.show(ctx, () => ctx.reply(text, { reply_markup: keyboard }));
  });

  composer.callbackQuery(/^plan:/, async (ctx) => {
    const id = parsePlanId(ctx.callbackQuery.data);
    const plan = id === null ? null : await deps.services.getEnabledPlan(id);
    if (!plan) {
      await ctx.answerCallbackQuery({ text: texts.staleButton });
      return;
    }
    await ctx.answerCallbackQuery();
    await screens.show(ctx, () =>
      ctx.reply(planScreenText(plan, deps.config.links.offer), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.menu('plans')),
      }),
    );
  });
}
