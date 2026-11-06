import { type Composer, GrammyError, InlineKeyboard, InputFile } from 'grammy';
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
    // По две в ряд, от главного к справочному; «Моя подписка» и «О сервисе» занимают весь ряд.
    const keyboard = new InlineKeyboard();
    if (until) keyboard.text(texts.buttons.mySubscription, cb.menu('my')).row();
    keyboard
      .text(texts.buttons.buy, cb.menu('buy'))
      .url(texts.buttons.catalog, links.catalog)
      .row()
      .url(texts.buttons.reviews, links.reviews)
      .url(texts.buttons.support, links.support)
      .row()
      .text(texts.buttons.about, cb.menu('about'));

    const caption = until
      ? `${deps.content.startText}\n\n${texts.subscriptionActiveUntil(formatDateMsk(until))}`
      : deps.content.startText;
    const upload = () => new InputFile(deps.content.startImage, 'start.jpg');
    const extra = { caption, parse_mode: 'HTML', reply_markup: keyboard } as const;
    let sent: Awaited<ReturnType<typeof ctx.replyWithPhoto>>;
    if (startPhotoFileId === undefined) {
      sent = await ctx.replyWithPhoto(upload(), extra);
    } else {
      try {
        sent = await ctx.replyWithPhoto(startPhotoFileId, extra);
      } catch (err) {
        // Telegram отверг сохранённый file_id: сбрасываем кэш и загружаем файл заново (один раз).
        if (!(err instanceof GrammyError) || err.error_code !== 400) throw err;
        startPhotoFileId = undefined;
        sent = await ctx.replyWithPhoto(upload(), extra);
      }
    }
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
