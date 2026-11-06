import { type Composer, InlineKeyboard, InputFile } from 'grammy';
import { formatDateMsk } from '../../domain/dates.js';
import { texts } from '../../texts.js';
import { cb } from '../callback-data.js';
import type { BotContext } from '../context.js';
import type { BotDeps } from '../create-bot.js';

export function registerStart<C extends BotContext>(composer: Composer<C>, deps: BotDeps): void {
  // file_id загруженной картинки: первый раз грузим файл, дальше отправляем id.
  let startPhotoFileId: string | undefined;

  async function sendMainMenu(ctx: C): Promise<void> {
    if (!ctx.from) return;
    const until = await deps.services.getActiveUntil(ctx.from.id, deps.clock());
    const { links } = deps.config;
    const keyboard = new InlineKeyboard()
      .text(texts.buttons.buy, cb.menu('buy'))
      .row()
      .url(texts.buttons.catalog, links.catalog)
      .row()
      .url(texts.buttons.reviews, links.reviews)
      .row()
      .text(texts.buttons.about, cb.menu('about'))
      .row()
      .url(texts.buttons.support, links.support);
    if (until) keyboard.row().text(texts.buttons.mySubscription, cb.menu('my'));

    const caption = until
      ? `${deps.content.startText}\n\n${texts.subscriptionActiveUntil(formatDateMsk(until))}`
      : deps.content.startText;
    const sent = await ctx.replyWithPhoto(
      startPhotoFileId ?? new InputFile(deps.content.startImage, 'start.jpg'),
      { caption, parse_mode: 'HTML', reply_markup: keyboard },
    );
    startPhotoFileId ??= sent.photo.at(-1)?.file_id;
  }

  // Параметр после /start (например paid_abc) пока не используется.
  composer.command('start', (ctx) => sendMainMenu(ctx));

  composer.callbackQuery(cb.menu('start'), async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMainMenu(ctx);
  });

  composer.callbackQuery(cb.menu('about'), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(deps.content.aboutText, { parse_mode: 'HTML' });
  });
}
