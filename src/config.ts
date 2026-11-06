import { z } from 'zod';

export interface Config {
  botToken: string;
  botUsername: string;
  databaseUrl: string;
  adminIds: number[];
  ownerId: number;
  ordersChatId: number;
  channelId: number;
  channelInviteLink: string;
  links: { catalog: string; reviews: string; support: string; offer: string; udidHelp: string };
  platega: { merchantId: string; secret: string };
  certEncryptionKey: Buffer;
  /** Исходный текст CERT_ENCRYPTION_KEY из .env, нужен для маскирования в логах. */
  certEncryptionKeyText: string;
  backupPassphrase: string;
  contentDir: string;
}

export class ConfigError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Неверные или пустые настройки в .env: ${variables.join(', ')}`);
    this.name = 'ConfigError';
    this.variables = variables;
  }
}

const intString = z
  .string()
  .regex(/^-?\d+$/)
  .transform(Number)
  .pipe(z.number().int().safe());

const httpsUrl = z.string().regex(/^https:\/\/\S+$/);

const adminIds = z
  .string()
  .transform((s) => s.split(',').map((p) => p.trim()))
  .pipe(z.array(intString).min(1));

const encryptionKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .transform((s) => Buffer.from(s, 'base64'))
  .refine((b) => b.length === 32);

const schema = z.object({
  BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/),
  BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  DATABASE_URL: z.string().min(1),
  ADMIN_IDS: adminIds,
  OWNER_ID: intString,
  ORDERS_CHAT_ID: intString,
  CHANNEL_ID: intString,
  CHANNEL_INVITE_LINK: z.string().regex(/^https:\/\/t\.me\/\S+$/),
  CATALOG_URL: httpsUrl,
  REVIEWS_URL: httpsUrl,
  SUPPORT_URL: httpsUrl,
  OFFER_URL: httpsUrl,
  UDID_HELP_URL: httpsUrl,
  PLATEGA_MERCHANT_ID: z.guid(),
  PLATEGA_SECRET: z.string().min(1),
  CERT_ENCRYPTION_KEY: encryptionKey,
  BACKUP_PASSPHRASE: z.string().min(16),
  CONTENT_DIR: z.string().min(1).default('./content'),
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const input = { ...env };
  // Пустое значение CONTENT_DIR (строка `CONTENT_DIR=` в .env) считается незаданным.
  if (input.CONTENT_DIR === '') delete input.CONTENT_DIR;

  const result = schema.safeParse(input);
  if (!result.success) {
    // Только имена переменных: значения (секреты) в ошибку не попадают.
    const names = new Set<string>();
    for (const issue of result.error.issues) names.add(String(issue.path[0]));
    throw new ConfigError([...names].sort());
  }
  const e = result.data;
  return {
    botToken: e.BOT_TOKEN,
    botUsername: e.BOT_USERNAME,
    databaseUrl: e.DATABASE_URL,
    adminIds: e.ADMIN_IDS,
    ownerId: e.OWNER_ID,
    ordersChatId: e.ORDERS_CHAT_ID,
    channelId: e.CHANNEL_ID,
    channelInviteLink: e.CHANNEL_INVITE_LINK,
    links: {
      catalog: e.CATALOG_URL,
      reviews: e.REVIEWS_URL,
      support: e.SUPPORT_URL,
      offer: e.OFFER_URL,
      udidHelp: e.UDID_HELP_URL,
    },
    platega: { merchantId: e.PLATEGA_MERCHANT_ID, secret: e.PLATEGA_SECRET },
    certEncryptionKey: e.CERT_ENCRYPTION_KEY,
    certEncryptionKeyText: input.CERT_ENCRYPTION_KEY ?? '',
    backupPassphrase: e.BACKUP_PASSPHRASE,
    contentDir: e.CONTENT_DIR,
  };
}

export function secretValues(config: Config): string[] {
  return [
    ...new Set([
      config.botToken,
      config.platega.secret,
      config.certEncryptionKeyText,
      config.certEncryptionKey.toString('base64'),
      config.backupPassphrase,
    ]),
  ];
}
