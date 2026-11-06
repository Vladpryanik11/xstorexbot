import { type Bot, BotError } from 'grammy';
import type { Message, Update, UserFromGetMe } from 'grammy/types';
import { pino } from 'pino';
import type { AdminServices } from '../../../src/admin/index.js';
import { AdminInput } from '../../../src/bot/admin/index.js';
import { type BotDeps, createBot } from '../../../src/bot/create-bot.js';
import type { BroadcastSummary, Broadcasts } from '../../../src/broadcast/types.js';
import type { Config } from '../../../src/config.js';
import type {
  BaseStats,
  PlanAdminView,
  SubscriberCard,
  SubscriberQuery,
} from '../../../src/domain/admin.js';
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
  seenAt: Date[] = [];
  blocked = new Map<number, Date | null>();
  touchUser: (from: TelegramFrom, now: Date) => Promise<void> = async (from, now) => {
    this.users.push(from);
    this.seenAt.push(now);
  };

  async setBlocked(from: TelegramFrom, blockedAt: Date | null): Promise<void> {
    this.blocked.set(from.id, blockedAt);
  }

  async markBlocked(userId: number, now: Date): Promise<void> {
    this.blocked.set(userId, now);
  }

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

export interface ServiceCall {
  method: string;
  args: unknown[];
}

export class FakeAdminServices implements AdminServices {
  /** Все вызовы по порядку: удобно проверять, что чего-то не вызывали. */
  calls: ServiceCall[] = [];
  plans: PlanAdminView[] = [
    { id: 1, days: 30, priceRub: 49000, priceStars: null, enabled: true },
    { id: 2, days: 90, priceRub: 117000, priceStars: null, enabled: true },
    { id: 3, days: 180, priceRub: 174000, priceStars: null, enabled: true },
  ];
  stats: BaseStats = { users: 0, reachable: 0, blocked: 0, active: 0 };
  /** id найденного подписчика; null — не найден. */
  foundUserId: number | null = null;
  card: SubscriberCard | null = null;
  addDaysResult: { endsAt: Date; paymentId: string } = {
    endsAt: new Date('2026-12-06T12:00:00Z'),
    paymentId: 'manual-1',
  };
  endSubscriptionResult = true;

  private log(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async listAllPlans(): Promise<PlanAdminView[]> {
    this.log('listAllPlans');
    return this.plans;
  }

  async getPlan(id: number): Promise<PlanAdminView | null> {
    this.log('getPlan', id);
    return this.plans.find((p) => p.id === id) ?? null;
  }

  async setPlanPriceRub(adminId: number, planId: number, kopecks: number): Promise<void> {
    this.log('setPlanPriceRub', adminId, planId, kopecks);
  }

  async setPlanPriceStars(adminId: number, planId: number, stars: number | null): Promise<void> {
    this.log('setPlanPriceStars', adminId, planId, stars);
  }

  async setPlanEnabled(adminId: number, planId: number, enabled: boolean): Promise<void> {
    this.log('setPlanEnabled', adminId, planId, enabled);
  }

  async findUserId(query: SubscriberQuery): Promise<number | null> {
    this.log('findUserId', query);
    return this.foundUserId;
  }

  async getSubscriberCard(userId: number): Promise<SubscriberCard | null> {
    this.log('getSubscriberCard', userId);
    return this.card;
  }

  async addDays(
    adminId: number,
    userId: number,
    days: number,
    now: Date,
  ): Promise<{ endsAt: Date; paymentId: string }> {
    this.log('addDays', adminId, userId, days, now);
    return this.addDaysResult;
  }

  async endSubscription(adminId: number, userId: number, now: Date): Promise<boolean> {
    this.log('endSubscription', adminId, userId, now);
    return this.endSubscriptionResult;
  }

  async baseStats(now: Date): Promise<BaseStats> {
    this.log('baseStats', now);
    return this.stats;
  }
}

export class FakeBroadcasts implements Broadcasts {
  calls: ServiceCall[] = [];
  recipients = 0;
  summary: BroadcastSummary | null = null;
  startResult: { ok: true; id: number; total: number } | { ok: false; reason: 'running' } = {
    ok: true,
    id: 1,
    total: 0,
  };
  stopResult = true;

  private log(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async countRecipients(): Promise<number> {
    this.log('countRecipients');
    return this.recipients;
  }

  async current(): Promise<BroadcastSummary | null> {
    this.log('current');
    return this.summary;
  }

  async start(input: Parameters<Broadcasts['start']>[0]): ReturnType<Broadcasts['start']> {
    this.log('start', input);
    return this.startResult;
  }

  async stop(adminId: number, broadcastId: number): Promise<boolean> {
    this.log('stop', adminId, broadcastId);
    return this.stopResult;
  }

  async resume(): Promise<void> {
    this.log('resume');
  }

  shutdown(): void {
    this.log('shutdown');
  }

  async idle(): Promise<void> {
    this.log('idle');
  }
}

export interface Call {
  method: string;
  payload: Record<string, unknown>;
}

export function createHarness(overrides: Partial<BotDeps> = {}) {
  const services = new FakeServices();
  const admin = new FakeAdminServices();
  const broadcasts = new FakeBroadcasts();
  const adminInput = new AdminInput();
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
    admin,
    broadcasts,
    ...overrides,
  };
  const bot: Bot = createBot(deps.config.botToken, deps, botInfo, adminInput);
  const calls: Call[] = [];
  let messageId = 100;

  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as Record<string, unknown>;
    calls.push({ method, payload: { ...p } });
    if (method === 'copyMessage') {
      messageId += 1;
      return { ok: true, result: { message_id: messageId } } as never;
    }
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
    const command = /^\/\S+/.exec(text)?.[0];
    await sendMessage(
      {
        text,
        ...(command
          ? { entities: [{ type: 'bot_command' as const, offset: 0, length: command.length }] }
          : {}),
      },
      opts.from,
      opts.chatType,
    );
  }

  /** Произвольное сообщение (фото, альбом, подпись…): поля `partial` перекрывают значения по умолчанию. */
  async function sendMessage(
    partial: Partial<Message>,
    fromOverride: Partial<TelegramFrom> = {},
    chatType: 'private' | 'group' = 'private',
  ): Promise<void> {
    const from = { id: 42, first_name: 'Иван', username: 'ivan', ...fromOverride };
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
        ...partial,
      } as Update['message'],
    };
    await dispatch(update);
  }

  async function press(
    data: string,
    opts: { from?: Partial<TelegramFrom>; messageId?: number; photo?: boolean } = {},
  ): Promise<void> {
    const from = { id: 42, first_name: 'Иван', username: 'ivan', ...opts.from };
    const update: Update = {
      update_id: updateId++,
      callback_query: {
        id: `cb${updateId}`,
        from: { ...from, is_bot: false },
        chat_instance: 'ci',
        data,
        message: {
          message_id: opts.messageId ?? 101,
          date: 0,
          chat: { id: from.id, type: 'private', first_name: from.first_name },
          ...(opts.photo
            ? { photo: [{ file_id: 'photo-file-id', file_unique_id: 'u', width: 1, height: 1 }] }
            : {}),
        },
      },
    };
    await dispatch(update);
  }

  async function chatMember(
    status: 'kicked' | 'member' | 'left',
    from: Partial<TelegramFrom> = {},
  ): Promise<void> {
    const user = { id: 42, first_name: 'Иван', username: 'ivan', ...from };
    const botUser = { id: botInfo.id, is_bot: true as const, first_name: 'Test' };
    const update: Update = {
      update_id: updateId++,
      my_chat_member: {
        chat: { id: user.id, type: 'private', first_name: user.first_name },
        from: { ...user, is_bot: false },
        date: 0,
        old_chat_member: {
          status: status === 'kicked' ? 'member' : 'kicked',
          user: botUser,
          ...(status === 'kicked' ? {} : { until_date: 0 }),
        } as never,
        new_chat_member: {
          status,
          user: botUser,
          ...(status === 'kicked' ? { until_date: 0 } : {}),
        } as never,
      },
    };
    await dispatch(update);
  }

  return {
    bot,
    calls,
    services,
    admin,
    broadcasts,
    adminInput,
    now,
    config: deps.config,
    sendText,
    sendMessage,
    press,
    chatMember,
  };
}
