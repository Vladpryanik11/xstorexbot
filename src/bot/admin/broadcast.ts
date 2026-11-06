import { type Composer, InlineKeyboard } from 'grammy';
import type { BroadcastButton } from '../../broadcast/types.js';
import { parseButton } from '../../domain/admin.js';
import { isBroadcastable, progressText, reportText } from '../../domain/broadcast.js';
import { formatDateMsk } from '../../domain/dates.js';
import { texts } from '../../texts.js';
import { cb } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';
import type { Screens } from '../screens.js';
import { type AdminInput, onInput, type Source } from './input.js';
import { showAdminMenu } from './menu.js';

const STOP_DATA = /^adm:bc:stop:(\d+)$/;

export function registerBroadcastSection<C extends BotContext>(
  composer: Composer<C>,
  deps: BotDeps,
  screens: Screens,
  input: AdminInput,
): void {
  const t = texts.admin;
  const back = (data: string) => new InlineKeyboard().text(texts.buttons.back, cb.admin(data));

  async function showSection(ctx: BotContext): Promise<void> {
    const current = await deps.broadcasts.current();
    const keyboard = new InlineKeyboard();
    let text: string;
    if (current === null) {
      text = t.noBroadcasts;
      keyboard.text(t.broadcastButtons.new, cb.admin('bc:new')).row();
    } else if (current.status === 'RUNNING') {
      text = progressText(current.sent + current.blocked + current.failed, current.total);
      keyboard.text(t.broadcastStopButton, cb.admin(`bc:stop:${current.id}`)).row();
    } else {
      text = `${t.lastBroadcast(formatDateMsk(current.finishedAt ?? current.createdAt))}\n${reportText(current)}`;
      keyboard.text(t.broadcastButtons.new, cb.admin('bc:new')).row();
    }
    keyboard.text(texts.buttons.back, cb.admin('menu'));
    await screens.show(ctx, () => ctx.reply(text, { reply_markup: keyboard }));
  }

  async function stale(ctx: BotContext): Promise<void> {
    await ctx.answerCallbackQuery({ text: texts.staleButton });
  }

  async function showPreview(
    ctx: BotContext,
    adminId: number,
    source: Source,
    button: BroadcastButton | null,
  ): Promise<void> {
    input.set(adminId, { kind: 'broadcastConfirm', source, button });
    await ctx.api.copyMessage(
      adminId,
      source.chatId,
      source.messageId,
      button ? { reply_markup: new InlineKeyboard().url(button.text, button.url) } : {},
    );
    const recipients = await deps.broadcasts.countRecipients();
    await screens.show(ctx, () =>
      ctx.reply(t.broadcastRecipients(recipients), {
        reply_markup: new InlineKeyboard()
          .text(t.broadcastButtons.send, cb.admin('bc:send'))
          .text(t.broadcastButtons.cancel, cb.admin('bc:cancel')),
      }),
    );
  }

  composer.callbackQuery(cb.admin('bc'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.clear(ctx.from.id);
    await showSection(ctx);
  });

  composer.callbackQuery(cb.admin('bc:new'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.set(ctx.from.id, { kind: 'broadcastMessage' });
    await screens.show(ctx, () => ctx.reply(t.askBroadcastMessage, { reply_markup: back('bc') }));
  });

  composer.callbackQuery(cb.admin('bc:cancel'), async (ctx) => {
    await ctx.answerCallbackQuery();
    input.clear(ctx.from.id);
    await showAdminMenu(ctx, screens);
  });

  composer.callbackQuery(cb.admin('bc:btn'), async (ctx) => {
    const state = input.get(ctx.from.id);
    if (state?.kind !== 'broadcastButtonChoice') {
      input.clear(ctx.from.id);
      await stale(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
    input.set(ctx.from.id, { kind: 'broadcastButton', source: state.source });
    await screens.show(ctx, () => ctx.reply(t.askBroadcastButton, { reply_markup: back('bc') }));
  });

  composer.callbackQuery(cb.admin('bc:nobtn'), async (ctx) => {
    const state = input.get(ctx.from.id);
    if (state?.kind !== 'broadcastButtonChoice') {
      input.clear(ctx.from.id);
      await stale(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
    await showPreview(ctx, ctx.from.id, state.source, null);
  });

  composer.callbackQuery(cb.admin('bc:send'), async (ctx) => {
    const adminId = ctx.from.id;
    const state = input.get(adminId);
    // Черновик расходуется сразу: повторное нажатие не запустит вторую рассылку.
    input.clear(adminId);
    if (state?.kind !== 'broadcastConfirm') {
      await stale(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
    const result = await deps.broadcasts.start({
      adminId,
      sourceChatId: state.source.chatId,
      sourceMessageId: state.source.messageId,
      button: state.button,
    });
    if (!result.ok) {
      await screens.show(ctx, () => ctx.reply(t.broadcastRunning, { reply_markup: back('bc') }));
      return;
    }
    await showSection(ctx);
  });

  composer.callbackQuery(STOP_DATA, async (ctx) => {
    input.clear(ctx.from.id);
    const id = Number(STOP_DATA.exec(ctx.callbackQuery.data)?.[1]);
    if (!Number.isSafeInteger(id)) {
      await stale(ctx);
      return;
    }
    const stopped = await deps.broadcasts.stop(ctx.from.id, id);
    await ctx.answerCallbackQuery(stopped ? {} : { text: t.broadcastAlreadyFinished });
  });

  onInput(input, 'broadcastMessage', async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    if (!isBroadcastable(ctx.message)) {
      await ctx.reply(t.badBroadcastMessage);
      return;
    }
    const source = { chatId: ctx.message.chat.id, messageId: ctx.message.message_id };
    input.set(ctx.from.id, { kind: 'broadcastButtonChoice', source });
    await screens.show(ctx, () =>
      ctx.reply(t.askBroadcastButtonChoice, {
        reply_markup: new InlineKeyboard()
          .text(t.broadcastButtons.addButton, cb.admin('bc:btn'))
          .text(t.broadcastButtons.noButton, cb.admin('bc:nobtn')),
      }),
    );
  });

  onInput(input, 'broadcastButton', async (ctx, state) => {
    if (!ctx.from) return;
    const button = parseButton(ctx.message?.text ?? '');
    if (button === null) {
      await ctx.reply(t.badBroadcastButton);
      return;
    }
    await showPreview(ctx, ctx.from.id, state.source, button);
  });
}
