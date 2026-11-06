import { type Composer, InlineKeyboard } from 'grammy';
import { parseRubToKopecks, parseStars, planAdminLine } from '../../domain/admin.js';
import { texts } from '../../texts.js';
import { cb } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';
import { type AdminInput, onInput } from './input.js';

const PLAN_DATA = /^adm:plan:(\d+)(?::(rub|stars|toggle))?$/;

export function registerPlansSection<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
  screens: Screens,
  input: AdminInput,
): void {
  const t = texts.admin;

  async function showCard(ctx: BotContext, planId: number): Promise<void> {
    const plan = await deps.admin.getPlan(planId);
    if (!plan) {
      await ctx.reply(texts.staleButton);
      return;
    }
    const keyboard = new InlineKeyboard()
      .text(t.planButtons.priceRub, cb.admin(`plan:${plan.id}:rub`))
      .text(t.planButtons.priceStars, cb.admin(`plan:${plan.id}:stars`))
      .row()
      .text(
        plan.enabled ? t.planButtons.hide : t.planButtons.enable,
        cb.admin(`plan:${plan.id}:toggle`),
      )
      .row()
      .text(texts.buttons.back, cb.admin('plans'));
    await screens.show(ctx, () => ctx.reply(planAdminLine(plan), { reply_markup: keyboard }));
  }

  composer.callbackQuery(cb.admin('plans'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.clear(ctx.from.id);
    const plans = await deps.admin.listAllPlans();
    const keyboard = new InlineKeyboard();
    for (const plan of plans) {
      keyboard.text(t.planDaysButton(plan.days), cb.admin(`plan:${plan.id}`)).row();
    }
    keyboard.text(texts.buttons.back, cb.admin('menu'));
    const text = [t.plansTitle, ...plans.map(planAdminLine)].join('\n');
    await screens.show(ctx, () => ctx.reply(text, { reply_markup: keyboard }));
  });

  composer.callbackQuery(PLAN_DATA, async (ctx) => {
    const adminId = ctx.from.id;
    const match = PLAN_DATA.exec(ctx.callbackQuery.data);
    const planId = Number(match?.[1]);
    const action = match?.[2];
    // Любой переход по разделу отменяет начатый ввод цены.
    input.clear(adminId);
    const plan = Number.isSafeInteger(planId) ? await deps.admin.getPlan(planId) : null;
    if (!plan) {
      await ctx.answerCallbackQuery({ text: texts.staleButton });
      return;
    }
    await ctx.answerCallbackQuery();

    if (action === 'rub' || action === 'stars') {
      const kind = action === 'rub' ? 'priceRub' : 'priceStars';
      input.set(adminId, { kind, planId });
      const prompt = action === 'rub' ? t.askPriceRub : t.askPriceStars;
      await screens.show(ctx, () =>
        ctx.reply(prompt, {
          reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.admin(`plan:${planId}`)),
        }),
      );
      return;
    }
    if (action === 'toggle') {
      await deps.admin.setPlanEnabled(adminId, planId, !plan.enabled);
    }
    await showCard(ctx, planId);
  });

  onInput(input, 'priceRub', async (ctx, state) => {
    const kopecks = parseRubToKopecks(ctx.message?.text ?? '');
    if (kopecks === null) {
      await ctx.reply(t.badPriceRub);
      return;
    }
    const adminId = ctx.from?.id as number;
    input.clear(adminId);
    await deps.admin.setPlanPriceRub(adminId, state.planId, kopecks);
    await showCard(ctx, state.planId);
  });

  onInput(input, 'priceStars', async (ctx, state) => {
    const stars = parseStars(ctx.message?.text ?? '');
    if (stars === null) {
      await ctx.reply(t.badPriceStars);
      return;
    }
    const adminId = ctx.from?.id as number;
    input.clear(adminId);
    await deps.admin.setPlanPriceStars(adminId, state.planId, stars === 'clear' ? null : stars);
    await showCard(ctx, state.planId);
  });
}
