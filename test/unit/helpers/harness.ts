import { type Bot, BotError } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { pino } from 'pino';
import { type BotDeps, createBot } from '../../../src/bot/create-bot.js';
import type { Config } from '../../../src/config.js';
import type { PlanView } from '../../../src/domain/plans.js';
import type { Services, TelegramFrom } from '../../../src/services/index.js';

export const TEST_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
export const TEST_ORDERS_CHAT_ID = -1001234567890;

export const botInfo: UserFromGetMe = {
  id: 123456,
  is_bot: true,
  first_name: 'Test',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

export function testConfig(): Config {
  return {
    botToken: TEST_TOKEN,
    botUsername: 'test_bot',
    databaseUrl: 'postgresql://u:p@127.0.0.1:5433/test',
    adminIds: [1],
    ownerId: 1,
    ordersChatId: TEST_ORDERS_CHAT_ID,
    channelId: -1009876543210,
    channelInviteLink: 'https://t.me/+invite',
    links: {
      catalog: 'https://example.com/catalog',
      reviews: 'https://example.com/reviews',
      support: 'https://example.com/support',
      offer: 'https://example.com/offer',
      udidHelp: 'https://example.com/udid',
    },
    platega: { merchantId: '00000000-0000-4000-8000-000000000000', secret: 'platega-secret' },
    certEncryptionKey: Buffer.alloc(32, 1),
    certEncryptionKeyText: Buffer.alloc(32, 1).toString('base64'),
    backupPassphrase: 'backup-passphrase-0123',
    contentDir: './content',
  };
}

export class FakeServices implements Services {
  users: TelegramFrom[] = [];
  activeUntil = new Map<number, Date>();
  plans: PlanView[] = [
    { id: 1, days: 30, priceRub: 49000, priceStars: null },
    { id: 2, days: 90, priceRub: 117000, priceStars: null },
    { id: 3, days: 180, priceRub: 174000, priceStars: null },
  ];
  touchUser: (from: TelegramFrom) => Promise<void> = async (from) => {
    this.users.push(from);
  };

  async getActiveUntil(userId: number, now: Date): Promise<Date | null> {
    const end = this.activeUntil.get(userId);
    return end && end > now ? end : null;
  }

  async listEnabledPlans(): Promise<PlanView[]> {
    return this.plans;
  }

  async getEnabledPlan(id: number): Promise<PlanView | null> {
    return this.plans.find((p) => p.id === id) ?? null;
  }
}

export interface Call {
  method: string;
  payload: Record<string, unknown>;
}

export function createHarness(overrides: Partial<BotDeps> = {}) {
  const services = new FakeServices();
  const now = { value: new Date('2026-11-06T12:00:00Z') };
  const deps: BotDeps = {
    config: testConfig(),
    content: {
      startText: 'Привет',
      aboutText: 'О сервисе',
      featherText: 'Перо',
      startImage: Buffer.from([0xff, 0xd8, 0xff]),
    },
    services,
    logger: pino({ level: 'silent' }),
    clock: () => now.value,
    ...overrides,
  };
  const bot: Bot = createBot(deps.config.botToken, deps, botInfo);
  const calls: Call[] = [];
  let messageId = 100;

  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as Record<string, unknown>;
    calls.push({ method, payload: { ...p } });
    if (method === 'sendMessage' || method === 'editMessageText') {
      messageId += 1;
      return {
        ok: true,
        result: {
          message_id: messageId,
          date: 0,
          chat: { id: p.chat_id ?? 0, type: 'private' },
          text: p.text ?? '',
        },
      } as never;
    }
    if (method === 'sendPhoto') {
      messageId += 1;
      return {
        ok: true,
        result: {
          message_id: messageId,
          date: 0,
          chat: { id: p.chat_id ?? 0, type: 'private' },
          photo: [{ file_id: 'photo-file-id', file_unique_id: 'u', width: 1, height: 1 }],
        },
      } as never;
    }
    return { ok: true, result: true } as never;
  });

  let updateId = 1;

  // handleUpdate бросает BotError; в бою его перехватывает runner и зовёт bot.catch.
  async function dispatch(update: Update): Promise<void> {
    try {
      await bot.handleUpdate(update);
    } catch (err) {
      if (!(err instanceof BotError)) throw err;
      await bot.errorHandler(err);
    }
  }

  async function sendText(
    text: string,
    opts: { chatType?: 'private' | 'group'; from?: Partial<TelegramFrom> } = {},
  ): Promise<void> {
    const chatType = opts.chatType ?? 'private';
    const from = { id: 42, first_name: 'Иван', username: 'ivan', ...opts.from };
    const command = /^\/\S+/.exec(text)?.[0];
    const update: Update = {
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: 0,
        chat:
          chatType === 'private'
            ? { id: from.id, type: 'private', first_name: from.first_name }
            : { id: -100500, type: 'group', title: 'Группа' },
        from: { ...from, is_bot: false },
        text,
        ...(command
          ? { entities: [{ type: 'bot_command' as const, offset: 0, length: command.length }] }
          : {}),
      },
    };
    await dispatch(update);
  }

  async function press(data: string, opts: { messageId?: number } = {}): Promise<void> {
    const update: Update = {
      update_id: updateId++,
      callback_query: {
        id: `cb${updateId}`,
        from: { id: 42, is_bot: false, first_name: 'Иван', username: 'ivan' },
        chat_instance: 'ci',
        data,
        message: {
          message_id: opts.messageId ?? 101,
          date: 0,
          chat: { id: 42, type: 'private', first_name: 'Иван' },
        },
      },
    };
    await dispatch(update);
  }

  return { bot, calls, services, now, config: deps.config, sendText, press };
}
