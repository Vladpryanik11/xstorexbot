import { autoRetry } from '@grammyjs/auto-retry';
import { run } from '@grammyjs/runner';
import { createBot } from './bot/create-bot.js';
import { type Config, ConfigError, loadConfig, secretValues } from './config.js';
import { ContentError, loadContent } from './content.js';
import { createPrisma } from './db.js';
import { createLogger, redactSecrets } from './logger.js';
import { createServices } from './services/index.js';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    // Сообщение ConfigError содержит только имена переменных, значения в него не попадают.
    if (err instanceof ConfigError) fail(err.message);
    throw err;
  }

  const secrets = secretValues(config);
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
  const bot = createBot(config.botToken, {
    config,
    content,
    services,
    logger,
    clock: () => new Date(),
  });
  bot.api.config.use(autoRetry());

  // Неверный токен должен ронять запуск, а не первое обновление.
  await bot.init();

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

main().catch((err: unknown) => {
  // Секреты неизвестны, если упала загрузка настроек; ConfigError обработан выше.
  const raw = err instanceof Error ? err.message : String(err);
  const secrets = [
    process.env.BOT_TOKEN,
    process.env.PLATEGA_SECRET,
    process.env.BACKUP_PASSPHRASE,
    process.env.CERT_ENCRYPTION_KEY,
    process.env.DATABASE_URL,
  ].filter((s): s is string => !!s);
  fail(`Ошибка запуска: ${redactSecrets(raw, secrets)}`);
});
