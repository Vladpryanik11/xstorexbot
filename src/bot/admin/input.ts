import type { BroadcastButton } from '../../broadcast/types.js';
import type { BotContext } from '../context.js';

export type Source = { chatId: number; messageId: number };

export type InputState =
  | { kind: 'subscriberQuery' }
  | { kind: 'addDays'; userId: number }
  | { kind: 'priceRub'; planId: number }
  | { kind: 'priceStars'; planId: number }
  | { kind: 'broadcastMessage' }
  | { kind: 'broadcastButtonChoice'; source: Source }
  | { kind: 'broadcastButton'; source: Source }
  | { kind: 'broadcastConfirm'; source: Source; button: BroadcastButton | null };

export type InputKind = InputState['kind'];

export type InputHandler<K extends InputKind> = (
  ctx: BotContext,
  state: Extract<InputState, { kind: K }>,
) => Promise<void>;

/** Что админ сейчас вводит; в памяти, одно состояние на админа. */
export class AdminInput {
  private readonly states = new Map<number, InputState>();
  private readonly handlers = new Map<InputKind, InputHandler<never>>();

  get(userId: number): InputState | undefined {
    return this.states.get(userId);
  }

  set(userId: number, state: InputState): void {
    this.states.set(userId, state);
  }

  clear(userId: number): void {
    this.states.delete(userId);
  }

  register<K extends InputKind>(kind: K, handler: InputHandler<K>): void {
    this.handlers.set(kind, handler as unknown as InputHandler<never>);
  }

  /** false, если для этого состояния нет обработчика. */
  async dispatch(ctx: BotContext, state: InputState): Promise<boolean> {
    const handler = this.handlers.get(state.kind) as
      | ((ctx: BotContext, state: InputState) => Promise<void>)
      | undefined;
    if (!handler) return false;
    await handler(ctx, state);
    return true;
  }
}

/** Раздел админки регистрирует здесь обработку ввода своего состояния. */
export function onInput<K extends InputKind>(
  input: AdminInput,
  kind: K,
  handler: InputHandler<K>,
): void {
  input.register(kind, handler);
}
