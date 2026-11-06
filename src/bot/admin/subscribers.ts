import { type Composer, GrammyError, InlineKeyboard } from 'grammy';
import { parseDays, parseSubscriberQuery, subscriberCardText } from '../../domain/admin.js';
import { formatDateMsk } from '../../domain/dates.js';
import { texts } from '../../texts.js';
import { cb } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';
import { type AdminInput, onInput } from './input.js';

const SUB_DATA = /^adm:sub:(\d+)(?::(days|end|endok))?$/;

export function registerSubscribersSection<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
  screens: Screens,
  input: AdminInput,
): void {
  const t = texts.admin;

  /** false, если подписчика нет (кнопка устарела). */
  async function showCard(ctx: BotContext, userId: number): Promise<boolean> {
    const card = await deps.admin.getSubscriberCard(userId);
    if (!card) return false;
    const now = deps.clock();
    const keyboard = new InlineKeyboard().text(
      t.subscriberButtons.addDays,
      cb.admin(`sub:${userId}:days`),
    );
    if (card.endsAt && card.endsAt.getTime() > now.getTime()) {
      keyboard.row().text(t.subscriberButtons.end, cb.admin(`sub:${userId}:end`));
    }
    keyboard.row().text(texts.buttons.back, cb.admin('menu'));
    await screens.show(ctx, () =>
      ctx.reply(subscriberCardText(card, now), { reply_markup: keyboard }),
    );
    return true;
  }

  composer.callbackQuery(cb.admin('subs'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.set(ctx.from.id, { kind: 'subscriberQuery' });
    await screens.show(ctx, () =>
      ctx.reply(t.askSubscriber, {
        reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.admin('menu')),
      }),
    );
  });

  composer.callbackQuery(SUB_DATA, async (ctx) => {
    const adminId = ctx.from.id;
    const match = SUB_DATA.exec(ctx.callbackQuery.data);
    const userId = Number(match?.[1]);
    const action = match?.[2];
    // Любой переход по разделу отменяет начатый ввод.
    input.clear(adminId);
    const card = Number.isSafeInteger(userId) ? await deps.admin.getSubscriberCard(userId) : null;
    if (!card) {
      await ctx.answerCallbackQuery({ text: texts.staleButton });
      return;
    }
    await ctx.answerCallbackQuery();

    if (action === 'days') {
      input.set(adminId, { kind: 'addDays', userId });
      await screens.show(ctx, () =>
        ctx.reply(t.askDays, {
          reply_markup: new InlineKeyboard().text(texts.buttons.back, cb.admin(`sub:${userId}`)),
        }),
      );
      return;
    }
    if (action === 'end') {
      const who = card.username === null ? card.firstName : `@${card.username}`;
      await screens.show(ctx, () =>
        ctx.reply(t.confirmEnd(who), {
          reply_markup: new InlineKeyboard()
            .text(t.subscriberButtons.endConfirm, cb.admin(`sub:${userId}:endok`))
            .text(t.subscriberButtons.cancel, cb.admin(`sub:${userId}`)),
        }),
      );
      return;
    }
    if (action === 'endok') {
      await deps.admin.endSubscription(adminId, userId, deps.clock());
    }
    await showCard(ctx, userId);
  });

  onInput(input, 'subscriberQuery', async (ctx) => {
    const query = parseSubscriberQuery(ctx.message?.text ?? '');
    if (query === null) {
      await ctx.reply(t.badSubscriberQuery);
      return;
    }
    const userId = await deps.admin.findUserId(query);
    if (userId === null || !(await showCard(ctx, userId))) {
      await ctx.reply(t.subscriberNotFound);
      return;
    }
    if (ctx.from) input.clear(ctx.from.id);
  });

  onInput(input, 'addDays', async (ctx, state) => {
    if (!ctx.from) return;
    const days = parseDays(ctx.message?.text ?? '');
    if (days === null) {
      await ctx.reply(t.badDays);
      return;
    }
    const adminId = ctx.from.id;
    input.clear(adminId);
    const now = deps.clock();
    const { endsAt } = await deps.admin.addDays(adminId, state.userId, days, now);

    let sendError: unknown = null;
    try {
      await ctx.api.sendMessage(state.userId, t.subscriptionExtended(formatDateMsk(endsAt)), {
        reply_markup: new InlineKeyboard().url(t.joinChannel, deps.config.channelInviteLink),
      });
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) {
        await deps.services.markBlocked(state.userId, now);
      } else {
        sendError = err;
      }
    }
    await showCard(ctx, state.userId);
    if (sendError !== null) throw sendError;
  });
}
