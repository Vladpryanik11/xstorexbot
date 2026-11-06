import { autoRetry } from '@grammyjs/auto-retry';
import { run } from '@grammyjs/runner';
import { createAdminServices } from './admin/index.js';
import { createBot } from './bot/create-bot.js';
import { createBroadcasts } from './broadcast/index.js';
import { createBroadcastStore } from './broadcast/store.js';
import { type Config, ConfigError, loadConfig, secretValues } from './config.js';
import { ContentError, loadContent } from './content.js';
import { createPrisma } from './db.js';
import { reportFatal } from './fatal.js';
import { createLogger } from './logger.js';
import { createServices } from './services/index.js';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function envSecrets(): string[] {
  return [
    process.env.BOT_TOKEN,
    process.env.PLATEGA_SECRET,
    process.env.PLATEGA_MERCHANT_ID,
    process.env.BACKUP_PASSPHRASE,
    process.env.CERT_ENCRYPTION_KEY,
    process.env.DATABASE_URL,
  ].filter((s): s is string => !!s);
}

// Пока настройки не разобраны, секреты берём из окружения; потом заменяем полным списком.
let secrets = envSecrets();

function die(err: unknown): never {
  reportFatal(err, secrets);
  process.exit(1);
}

async function main(): Promise<void> {
  process.on('uncaughtException', die);
  process.on('unhandledRejection', die);

  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    // Сообщение ConfigError содержит только имена переменных, значения в него не попадают.
    if (err instanceof ConfigError) fail(err.message);
    throw err;
  }

  secrets = secretValues(config);
  const logger = createLogger(secrets);

  let content: Awaited<ReturnType<typeof loadContent>>;
  try {
    content = await loadContent(config.contentDir);
  } catch (err) {
    if (err instanceof ContentError) fail(err.message);
    throw err;
  }

  const prisma = createPrisma(config.databaseUrl);
  const services = createServices(prisma);
  const clock = (): Date => new Date();
  const broadcasts = createBroadcasts({
    store: createBroadcastStore(prisma),
    api: () => bot.api,
    clock,
    logger,
  });
  const bot = createBot(config.botToken, {
    config,
    content,
    services,
    logger,
    clock,
    admin: createAdminServices(prisma),
    broadcasts,
  });
  // Не включать rethrowHttpErrors: тогда runner сам делает console.error для ошибок node-fetch,
  // а в их тексте есть URL с токеном бота.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

  // Неверный токен должен ронять запуск, а не первое обновление.
  await bot.init();
  broadcasts.resume().catch((err) => logger.error({ err }, 'не удалось возобновить рассылку'));

  const runner = run(bot, {
    runner: {
      fetch: {
        allowed_updates: [
          'message',
          'callback_query',
          'pre_checkout_query',
          'chat_join_request',
          'my_chat_member',
        ],
      },
    },
  });
  logger.info({ botUsername: bot.botInfo.username }, 'Бот запущен');

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Остановка');
    try {
      await runner.stop();
      await runner.task();
      // Рассылка остаётся RUNNING и продолжится после перезапуска.
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        broadcasts.idle(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 10_000);
        }),
      ]);
      clearTimeout(timer);
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'ошибка при остановке');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Если опрос Telegram завершился сам, процесс не должен молча жить дальше.
  await runner.task();
  if (!stopping) fail('Опрос Telegram остановился');
}

main().catch(die);
