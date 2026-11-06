import { GrammyError } from 'grammy';
import type { BotContext } from './context.js';

interface ChatScreens {
  menuId?: number;
  screenId?: number;
}

/**
 * Смена экранов (спецификация 6.1.1): старый экран удаляется, новый отправляется.
 * Номера сообщений живут только в памяти; после перезапуска удаляется нажатое сообщение,
 * если это не меню (меню — единственное сообщение с картинкой).
 * Важные сообщения (оплата, ссылка в канал, сертификаты) сюда не попадают и не удаляются.
 */
export class Screens {
  private readonly chats = new Map<number, ChatScreens>();

  /** Удаляет открытый экран (и нажатый экран) и отправляет новый. */
  async show(ctx: BotContext, send: () => Promise<{ message_id: number }>): Promise<void> {
    const state = this.state(ctx);
    if (!state) return;
    await this.remove(ctx, [pressedScreenId(ctx), state.screenId], state.menuId);
    state.screenId = undefined;
    const sent = await send();
    state.screenId = sent.message_id;
  }

  /** «‹ Назад» с экрана, у которого нет предыдущего: остаётся меню. */
  async close(ctx: BotContext): Promise<void> {
    const state = this.state(ctx);
    if (!state) return;
    await this.remove(ctx, [pressedScreenId(ctx), state.screenId], state.menuId);
    state.screenId = undefined;
  }

  /** Повторный /start: убирает сообщение покупателя, старое меню и экран, присылает новое меню. */
  async resetMenu(ctx: BotContext, send: () => Promise<{ message_id: number }>): Promise<void> {
    const state = this.state(ctx);
    if (!state) return;
    await this.remove(ctx, [
      ctx.message?.message_id,
      pressedScreenId(ctx),
      state.menuId,
      state.screenId,
    ]);
    state.menuId = undefined;
    state.screenId = undefined;
    const sent = await send();
    state.menuId = sent.message_id;
  }

  private state(ctx: BotContext): ChatScreens | undefined {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return undefined;
    let state = this.chats.get(chatId);
    if (!state) {
      state = {};
      this.chats.set(chatId, state);
    }
    return state;
  }

  private async remove(ctx: BotContext, ids: (number | undefined)[], keep?: number): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const unique = [...new Set(ids)].filter((id): id is number => id !== undefined && id !== keep);
    // По одному и по порядку: сообщений два-три, а порядок исчезновения предсказуем.
    for (const id of unique) {
      try {
        await ctx.api.deleteMessage(chatId, id);
      } catch (err) {
        // Старше 48 часов или уже удалено: экран всё равно меняется.
        if (!(err instanceof GrammyError)) throw err;
      }
    }
  }
}

/** Нажатое сообщение, если это экран, а не меню с картинкой. */
function pressedScreenId(ctx: BotContext): number | undefined {
  const message = ctx.callbackQuery?.message;
  if (!message || 'photo' in message) return undefined;
  return message.message_id;
}
