# Этап 1 «Каркас»: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель:** запускаемый бот с базой и тарифами: `/start` с картинкой и кнопками, «О сервисе», список тарифов и экран тарифа (пока без кнопок оплаты), `/terms`, `/paysupport`, проверка настроек, CI.

**Архитектура:** один пакет TypeScript (ESM), один процесс, long polling через `@grammyjs/runner`. Обработчики бота тонкие и получают зависимости через `BotDeps`: настройки, тексты, сервисы, часы. Сервисы работают с PostgreSQL через Prisma, поэтому диалоги тестируются модульно на поддельных сервисах, а сами сервисы — интеграционно на настоящей базе.

**Стек:** Node 24, pnpm, TypeScript, grammY, `@grammyjs/runner`, `@grammyjs/auto-retry`, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL 17, zod, pino, Vitest, Biome, tsx (только для разработки).

**Спецификация:** `docs/superpowers/specs/2026-11-06-xstorexbot-design.md`. Разделы этого этапа: 5, 6.1, 6.2 (шаги 1–2), 6.6, 7.1, 9.2 (неожиданная ошибка), 10, 11, 13.1, 13.2, 15, 17.

## Глобальные ограничения

- Node 24, `"packageManager": "pnpm@12.16.1"`, `"type": "module"`, TypeScript `module: nodenext`, в импортах расширение `.js`.
- Версии как у сайта: TypeScript 6.0.3, Biome 2.6.4, Vitest 5.1.0, Prisma, `@prisma/client` и `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1, `@types/node` 24.19.2. Остальные зависимости — последняя версия на момент установки, всегда с точной версией (`pnpm add -E`).
- Все тексты бота на русском. Даты для покупателя — `ДД.ММ.ГГГГ` по московскому времени (`Europe/Moscow`).
- Суммы в рублях хранятся в копейках, время — в UTC.
- Токен бота, ключи Platega, ключ шифрования и пароль резервных копий не попадают в git, логи и тексты ошибок.
- Интеграционные тесты идут только на настоящей PostgreSQL 17. PostgreSQL для разработки слушает `127.0.0.1:5433`, потому что порт 5432 на машине занят базой сайта.
- Работа ведётся в ветке `stage-1-skeleton`. Каждая задача заканчивается коммитом, сообщение коммита заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Пушить только после подтверждения владельца.
- Разработка по TDD: сначала падающий тест.
- **Не входит в этап:** кнопки оплаты, обработчик «Моя подписка» (этап 2), параметр `/start paid_<id>` (этап 3), Docker-образ и production compose (этап 6), планировщик.

## На что смотреть при ревью

1. **Команды в группе.** Бот состоит в чате заказов. `/start` или нажатие кнопки там должны игнорироваться, а не показывать меню всей группе. Тест — задача 5.
2. **Старые и чужие кнопки.** `plan:999`, тариф, скрытый после показа списка, или мусор в `callback_data`: ответ «Кнопка устарела, нажмите /start», без падения. Тест — задача 6.
3. **Длинный `start.txt`.** Подпись к фото в Telegram не длиннее 1024 символов. Слишком длинный текст должен ронять запуск с понятной ошибкой, а не каждый `/start`. Тест — задача 3.
4. **Утечка секретов в ошибке настроек.** Сообщение о неверном `.env` называет переменные, но не их значения. Тест — задача 2.
5. **Покупатель без @username и вернувшийся после блокировки.** `touchUser` сохраняет `username = null` и снимает `blockedAt`. Тест — задача 4.

---

### Задача 1: Каркас репозитория и чистые функции

**Файлы:**
- Создать: `package.json`, `pnpm-workspace.yaml` (только `onlyBuiltDependencies` для prisma и esbuild, если pnpm их попросит), `tsconfig.json`, `tsconfig.build.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `.gitattributes`, `.env.example`, `CLAUDE.md`, `README.md`, `.github/workflows/ci.yml`
- Создать: `src/texts.ts`, `src/domain/dates.ts`, `src/domain/money.ts`, `src/domain/plans.ts`, `src/domain/html.ts`
- Тест: `test/unit/domain/dates.test.ts`, `test/unit/domain/plans.test.ts`

**Interfaces:**
- Produces:
  - `formatDateMsk(date: Date): string` — `'15.12.2026'`.
  - `formatRub(kopecks: number): string` — `'1170 ₽'`.
  - `monthlyPriceRub(priceKopecks: number, days: number): number` — рубли, округление до целого.
  - `type PlanView = { id: number; days: number; priceRub: number; priceStars: number | null }`, где `priceRub` — копейки, как поле `Plan.priceRub` в базе.
  - `planButtonLabel(plan: PlanView): string`.
  - `planScreenText(plan: PlanView, offerUrl: string): string` — HTML для `parse_mode: 'HTML'`.
  - `escapeHtml(text: string): string` — экранирует `& < > "`.
  - `texts` — объект со всеми служебными текстами и подписями кнопок (ниже).

- [ ] **Шаг 1: Создать ветку и каркас**

`git switch -c stage-1-skeleton`. Файлы по образцу сайта (`C:\Users\Влад\xSTOREx website`): `biome.json` с теми же настройками форматирования (2 пробела, ширина 100, LF, одинарные кавычки, исключить `**/generated`, `**/*.md`, `dist`). `.gitattributes`: `* text=auto eol=lf`. `.gitignore`: `node_modules`, `dist`, `.env`, `src/generated`, `content/`, `coverage`.

Скрипты `package.json`:

| Скрипт | Команда |
|---|---|
| `dev` | `tsx watch --env-file=.env src/main.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/main.js` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run --project unit` |
| `test:int` | `vitest run --project int` |
| `db:up` / `db:down` | `docker compose -f compose.dev.yml up -d --wait` / `... down` |
| `db:migrate` | `prisma migrate dev` |
| `postinstall` | `prisma generate` (добавляется в задаче 4) |

`vitest.config.ts`: два проекта. `unit` — `test/unit/**/*.test.ts`. `int` — `test/int/**/*.test.ts`, `fileParallelism: false`, `globalSetup` из задачи 4.

`.env.example`: все переменные из раздела 15 спецификации с пустыми значениями и комментарием к каждой, плюс `DATABASE_URL_TEST=postgresql://bot:bot@127.0.0.1:5433/xstorexbot_test`.

`CLAUDE.md` (на русском): что это за проект (1–2 предложения и ссылка на спецификацию), общение с владельцем на русском, процесс (спецификация → план → TDD → проверка перед «готово»), жёсткие правила (только собственные IPA владельца, секреты не в git и логах, сертификаты только зашифрованными), команды из таблицы выше, порт PostgreSQL 5433. `README.md`: первая настройка (`cp .env.example .env`, `pnpm install`, `pnpm db:up`, `pnpm db:migrate`, `content/` из `content.example/`, `pnpm dev`) и команды проверки.

`.github/workflows/ci.yml`: на `pull_request` и `push` в `main`, `permissions: contents: read`. Задача `check`: `pnpm install --frozen-lockfile`, `pnpm biome ci .`, `pnpm typecheck`, `pnpm test`, `pnpm audit --prod`. Задача `integration` добавляется в задаче 4.

- [ ] **Шаг 2: Написать падающие тесты**

```ts
// test/unit/domain/dates.test.ts
expect(formatDateMsk(new Date('2026-12-15T20:59:00Z'))).toBe('15.12.2026');
expect(formatDateMsk(new Date('2026-12-15T21:00:00Z'))).toBe('16.12.2026'); // полночь по Москве

// test/unit/domain/plans.test.ts
const p90 = { id: 2, days: 90, priceRub: 117000, priceStars: null };
expect(formatRub(117000)).toBe('1170 ₽');
expect(monthlyPriceRub(49000, 30)).toBe(490);
expect(monthlyPriceRub(117000, 90)).toBe(390);
expect(monthlyPriceRub(174000, 180)).toBe(290);
expect(monthlyPriceRub(100000, 90)).toBe(333);
expect(planButtonLabel(p90)).toBe('90 дней — 1170 ₽');
expect(planScreenText(p90, 'https://telegra.ph/oferta?a=1&b=2')).toBe(
  'Подписка: 90 дней\nСтоимость: 1170 ₽ (390 ₽ в месяц)\n\n' +
    'Оплачивая, вы принимаете условия <a href="https://telegra.ph/oferta?a=1&amp;b=2">оферты</a>.',
);
expect(planScreenText({ id: 1, days: 30, priceRub: 49000, priceStars: null }, 'https://x.y'))
  .toContain('Стоимость: 490 ₽\n'); // для 30 дней строки «в месяц» нет
```

- [ ] **Шаг 3: Запустить и убедиться, что тесты падают**

Run: `pnpm install && pnpm test`
Expected: FAIL, модули `src/domain/*` не найдены.

- [ ] **Шаг 4: Реализовать функции и `src/texts.ts`**

`formatDateMsk` — `Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' })`. Цена в рублях выводится целым числом без разделителей тысяч.

`src/texts.ts`, точные тексты:

| Ключ | Текст |
|---|---|
| `buttons.buy` | `Купить подписку` |
| `buttons.catalog` | `Каталог приложений` |
| `buttons.reviews` | `Отзывы` |
| `buttons.about` | `О сервисе` |
| `buttons.support` | `Поддержка` |
| `buttons.mySubscription` | `Моя подписка` |
| `buttons.back` | `Назад` |
| `subscriptionActiveUntil(date)` | `Подписка активна до ${date}` |
| `planListTitle` | `Выберите срок подписки:` |
| `noPlans` | `Сейчас нет доступных тарифов. Напишите в поддержку.` |
| `paySupport` | `По вопросам оплаты и возврата напишите в поддержку.` |
| `terms(url)` | `Оферта сервиса: ${url}` |
| `staleButton` | `Кнопка устарела, нажмите /start` |
| `genericError` | `Что-то пошло не так, попробуйте ещё раз.` |

- [ ] **Шаг 5: Проверить**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: все тесты PASS, Biome и tsc без ошибок.

- [ ] **Шаг 6: Коммит**

`git add -A && git commit` с сообщением `chore: project skeleton, domain helpers and CI`.

---

### Задача 2: Настройки и логи без секретов

**Файлы:**
- Создать: `src/config.ts`, `src/logger.ts`
- Тест: `test/unit/config.test.ts`, `test/unit/logger.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Config {
    botToken: string; botUsername: string; databaseUrl: string;
    adminIds: number[]; ownerId: number; ordersChatId: number;
    channelId: number; channelInviteLink: string;
    links: { catalog: string; reviews: string; support: string; offer: string; udidHelp: string };
    platega: { merchantId: string; secret: string };
    certEncryptionKey: Buffer; backupPassphrase: string; contentDir: string;
  }
  class ConfigError extends Error { readonly variables: string[] }
  loadConfig(env: Record<string, string | undefined>): Config
  secretValues(config: Config): string[] // botToken, platega.secret, ключ в base64, backupPassphrase
  redactSecrets(text: string, secrets: string[]): string // каждое вхождение → '[скрыто]'
  createLogger(secrets: string[], destination?: NodeJS.WritableStream): Logger // pino, JSON в stdout
  ```

- [ ] **Шаг 1: Написать падающие тесты**

`config.test.ts` использует объект `validEnv` со всеми переменными раздела 15.

- `loadConfig(validEnv)` возвращает разобранный объект: `adminIds` из `'111, 222'` → `[111, 222]`, `CHANNEL_ID='-1001234567890'` → `-1001234567890`, `certEncryptionKey.length === 32`, `contentDir === './content'`, если `CONTENT_DIR` не задан.
- Без `BOT_TOKEN` и с `ADMIN_IDS='abc'` бросается `ConfigError`, у которого `variables` равны `['ADMIN_IDS', 'BOT_TOKEN']` (по алфавиту). `message` начинается с `Неверные или пустые настройки в .env:` и **не содержит** значений: при `PLATEGA_SECRET='super-secret-value'` и неверном `PLATEGA_MERCHANT_ID` в сообщении нет `super-secret-value`.
- Отказ, если: `CERT_ENCRYPTION_KEY` не декодируется в 32 байта; ссылка не начинается с `https://`; `CHANNEL_INVITE_LINK` не начинается с `https://t.me/`; `BACKUP_PASSPHRASE` короче 16 символов; `BOT_USERNAME` не соответствует `/^[A-Za-z0-9_]{5,32}$/`; `PLATEGA_MERCHANT_ID` не UUID.

`logger.test.ts`:
- `redactSecrets('url /bot123:ABC/getMe', ['123:ABC'])` → `'url /bot[скрыто]/getMe'`. Пустые строки в `secrets` игнорируются.
- Логгер с поддельным `destination` после `logger.error({ err: new Error('fail 123:ABC') }, 'x')` пишет строку, в которой нет `123:ABC`, а есть `[скрыто]`.

- [ ] **Шаг 2: Запустить, убедиться в падении**

Run: `pnpm test`
Expected: FAIL, `src/config.ts` не найден.

- [ ] **Шаг 3: Реализовать**

`loadConfig` — схема zod. Ошибки собираются через `safeParse`, в `ConfigError` попадают только имена переменных (`issue.path[0]`). `BOT_TOKEN` проверяется по `/^\d+:[A-Za-z0-9_-]{30,}$/`. `createLogger` оборачивает `destination` (по умолчанию `process.stdout`) в поток, который пропускает каждую строку через `redactSecrets`. Уровень `info`.

- [ ] **Шаг 4: Проверить**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Шаг 5: Коммит**

`feat: validated config and secret-free logger`

---

### Задача 3: Тексты из папки `content/`

**Файлы:**
- Создать: `src/content.ts`, `content.example/start.txt`, `content.example/about.txt`, `content.example/feather.txt`, `content.example/README.md` (что положить в `start.jpg`)
- Тест: `test/unit/content.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Content { startText: string; aboutText: string; featherText: string; startImage: Buffer }
  class ContentError extends Error {}
  loadContent(dir: string): Promise<Content>
  ```

Тексты — HTML в подмножестве Telegram, отправляются с `parse_mode: 'HTML'`. Картинку `start.jpg` даёт владелец, в репозитории её нет.

- [ ] **Шаг 1: Написать падающие тесты**

Тесты создают временную папку (`fs.mkdtemp` в `os.tmpdir()`), а в качестве картинки пишут буфер `Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])`.

- Корректная папка → тексты без пробелов по краям, `startImage` равен записанному буферу.
- `start.txt` начинается с BOM (`\uFEFF`) → BOM убран.
- Нет `about.txt` → `ContentError`, в сообщении есть `about.txt`.
- Пустой `feather.txt` (только пробелы) → `ContentError`.
- `start.txt` длиннее 900 символов → `ContentError` с текстом `start.txt длиннее 900 символов`. Подпись к фото ограничена 1024 символами, запас нужен под строку о подписке.
- `about.txt` или `feather.txt` длиннее 4000 символов → `ContentError`.
- `start.jpg` не начинается с `FF D8 FF` или больше 10 МБ → `ContentError`.

- [ ] **Шаг 2: Запустить, убедиться в падении**

Run: `pnpm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать `loadContent` и примеры**

Примеры в `content.example/` — короткие нейтральные тексты xstorex: приветствие, «О сервисе», шаги установки в Feather (`.p12`, `.mobileprovision`, пароль, импорт сертификата, подпись IPA).

- [ ] **Шаг 4: Проверить**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Шаг 5: Коммит**

`feat: load bot texts and start image from content dir`

---

### Задача 4: База, тарифы и сервисы

**Файлы:**
- Создать: `compose.dev.yml`, `infra/init-test-db.sql`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql`, `src/db.ts`, `src/services/index.ts`, `src/services/users.ts`, `src/services/subscriptions.ts`, `src/services/plans.ts`, `test/int/global-setup.ts`, `test/int/helpers/db.ts`
- Изменить: `package.json` (`postinstall`), `.github/workflows/ci.yml` (задача `integration`)
- Тест: `test/int/services.test.ts`, `test/int/schema.test.ts`

**Interfaces:**
- Consumes: `PlanView` из задачи 1.
- Produces:
  ```ts
  createPrisma(databaseUrl: string): PrismaClient // адаптер @prisma/adapter-pg
  interface TelegramFrom { id: number; username?: string; first_name: string }
  interface Services {
    touchUser(from: TelegramFrom): Promise<void>;
    getActiveUntil(userId: number, now: Date): Promise<Date | null>; // endsAt, если endsAt > now
    listEnabledPlans(): Promise<PlanView[]>; // enabled = true, по sort
    getEnabledPlan(id: number): Promise<PlanView | null>;
  }
  createServices(prisma: PrismaClient): Services
  resetDb(prisma: PrismaClient): Promise<void> // только для тестов
  ```

- [ ] **Шаг 1: PostgreSQL для разработки**

`compose.dev.yml`: сервис `postgres`, образ `postgres:17-alpine`, `127.0.0.1:5433:5432`, пользователь и пароль `bot`, база `xstorexbot`, том с данными, healthcheck `pg_isready`. `infra/init-test-db.sql` монтируется в `/docker-entrypoint-initdb.d/` и создаёт базу `xstorexbot_test`.

Run: `pnpm db:up`
Expected: контейнер `healthy`.

- [ ] **Шаг 2: Схема Prisma**

Генератор `prisma-client` с выводом в `src/generated/prisma`, `prisma.config.ts` по образцу сайта (`.env` читается, если файл есть; без `DATABASE_URL` подставляется заглушка, чтобы `prisma generate` не падал). Модели и поля — ровно таблица раздела 11 спецификации:
- `User.id`, `userId` и `adminId` — `BigInt`.
- Статусы и провайдеры — `enum`.
- `Payment.providerPaymentId` — `@unique`, может быть пустым.
- `Plan.days` — `@unique`.
- `Subscription.userId` — первичный ключ и связь с `User`.

Run: `pnpm prisma migrate dev --create-only --name init`

Дописать в конец созданного `migration.sql`:

```sql
CREATE UNIQUE INDEX "CertRequest_one_open_per_user" ON "CertRequest" ("userId") WHERE "status" = 'OPEN';
INSERT INTO "Plan" ("days", "priceRub", "priceStars", "enabled", "sort") VALUES
  (30, 49000, NULL, true, 1), (90, 117000, NULL, true, 2), (180, 174000, NULL, true, 3);
```

Run: `pnpm prisma migrate dev`
Expected: миграция применена, клиент сгенерирован.

- [ ] **Шаг 3: Подготовка интеграционных тестов**

`test/int/global-setup.ts` запускает `pnpm exec prisma migrate deploy` с `DATABASE_URL = DATABASE_URL_TEST`. Если `DATABASE_URL_TEST` не задан, тесты падают с понятной ошибкой. `resetDb` выполняет `TRUNCATE "User", "Subscription", "Payment", "CertRequest", "AdminLog" CASCADE` и возвращает три тарифа к начальным значениям.

- [ ] **Шаг 4: Написать падающие тесты**

`schema.test.ts`:
- после миграции в `Plan` ровно три тарифа: `30/49000`, `90/117000`, `180/174000`, у всех `priceStars = null` и `enabled = true`;
- вторая заявка `CertRequest` со статусом `OPEN` у того же пользователя отклоняется базой, а заявка `ISSUED` рядом с открытой допускается.

`services.test.ts` (`beforeEach` вызывает `resetDb`):
- `touchUser({ id: 1, first_name: 'Аня' })` создаёт пользователя с `username = null`. Повторный вызов с `username: 'anya'` обновляет имя пользователя, запись по-прежнему одна.
- если у пользователя стоит `blockedAt`, `touchUser` сбрасывает его в `null`;
- `getActiveUntil`: подписки нет → `null`; `endsAt` в прошлом → `null`; `endsAt` в будущем → эта дата;
- `listEnabledPlans()` возвращает три тарифа в порядке `sort`. Скрытый тариф не попадает в список, а `getEnabledPlan` возвращает для него `null`.
- `getEnabledPlan(999)` → `null`.

- [ ] **Шаг 5: Запустить, убедиться в падении**

Run: `pnpm test:int`
Expected: FAIL в `services.test.ts` (сервисов нет). `schema.test.ts` уже PASS.

- [ ] **Шаг 6: Реализовать `src/db.ts` и `src/services/*`**

`touchUser` — `upsert` по `id`. Сервисы переводят `BigInt` в `number` на границе: Telegram ID меньше 2^53.

- [ ] **Шаг 7: Проверить**

Run: `pnpm test:int && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Шаг 8: CI**

В `ci.yml` добавить задачу `integration`: сервис `postgres:17-alpine` (пользователь и пароль `bot`, база `xstorexbot_test`, healthcheck), `DATABASE_URL_TEST=postgresql://bot:bot@localhost:5432/xstorexbot_test`, шаги `pnpm install --frozen-lockfile` и `pnpm test:int`.

- [ ] **Шаг 9: Коммит**

`feat: prisma schema, seed plans and user/plan services`

---

### Задача 5: Ядро бота, ошибки и служебные команды

**Файлы:**
- Создать: `src/bot/create-bot.ts`, `src/bot/context.ts`, `src/bot/middleware.ts`, `src/bot/errors.ts`, `src/bot/orders-chat.ts`, `src/bot/user/commands.ts`, `test/unit/helpers/harness.ts`
- Тест: `test/unit/bot/commands.test.ts`, `test/unit/bot/errors.test.ts`, `test/unit/bot/orders-chat.test.ts`

**Interfaces:**
- Consumes: `Config` и `Logger` (задача 2), `Content` (задача 3), `Services` (задача 4), `texts` (задача 1).
- Produces:
  ```ts
  type Clock = () => Date;
  interface BotDeps { config: Config; content: Content; services: Services; logger: Logger; clock: Clock }
  createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot
  interface OrdersChat { notifyError(key: string, text: string): Promise<void> }
  createOrdersChat(opts: { send: (text: string) => Promise<unknown>; clock: Clock; logger: Logger }): OrdersChat
  // test/unit/helpers/harness.ts
  createHarness(overrides?: Partial<BotDeps>): {
    bot: Bot; calls: { method: string; payload: Record<string, unknown> }[];
    services: FakeServices; // в памяти: users, activeUntil, plans (три тарифа из 7.1)
    now: { value: Date }; // часы, которые тест двигает
    sendText(text: string, opts?: { chatType?: 'private' | 'group'; from?: Partial<TelegramFrom> }): Promise<void>;
    press(data: string, opts?: { messageId?: number }): Promise<void>;
  }
  ```

Порядок обработки в `createBot`: middleware `private` (`bot.chatType('private')`) → `touchUser` → команды и кнопки → последний обработчик `callback_query:data` отвечает `texts.staleButton` через `answerCallbackQuery`. Обновления не из личных чатов в этом этапе игнорируются целиком. `bot.catch` вызывает `handleBotError`.

Харнесс: `new Bot(token, { botInfo })` с фиксированным `botInfo` и транспорт `bot.api.config.use` вместо сети. Транспорт пишет вызов в `calls` и возвращает правдоподобный `result`: для `sendMessage`, `sendPhoto` и `editMessageText` — сообщение с растущим `message_id` (у `sendPhoto` есть `photo: [{ file_id: 'photo-file-id', ... }]`), для остальных методов — `true`.

- [ ] **Шаг 1: Написать падающие тесты**

`commands.test.ts`:
- `/paysupport` → один `sendMessage` с текстом `texts.paySupport` и кнопкой-ссылкой `Поддержка` на `config.links.support`;
- `/terms` → `sendMessage` с текстом `Оферта сервиса: <config.links.offer>`;
- `/terms` в группе (`chatType: 'group'`) → ни одного вызова API, а `touchUser` не вызывается;
- любое сообщение в личке вызывает `services.touchUser` с данными отправителя;
- `press('garbage')` → `answerCallbackQuery` с `text: texts.staleButton`.

`orders-chat.test.ts` (поддельная `send`, часы двигаются вручную):
- первый `notifyError('k', 'текст')` отправляет сообщение;
- повтор с тем же ключом через 9 минут не отправляет, через 10 минут отправляет;
- другой ключ отправляется сразу;
- если `send` бросает ошибку, `notifyError` её не пробрасывает и пишет в лог.

`errors.test.ts` (`services.touchUser` в харнессе бросает `new Error('db down 123:ABC')`, токен в конфиге содержит `123:ABC`):
- покупатель получает `sendMessage` с `texts.genericError`;
- в чат заказов (`chat_id === config.ordersChatId`) уходит сообщение, которое начинается с `Ошибка:`, содержит `db down` и не содержит `123:ABC`;
- текст для чата заказов обрезан до 300 символов.

- [ ] **Шаг 2: Запустить, убедиться в падении**

Run: `pnpm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать**

- `createOrdersChat`: ключи со временем последней отправки хранятся в `Map`, окно 10 минут.
- `handleBotError(err: BotError, deps, ordersChat)`:
  - пишет ошибку в лог;
  - вызывает `ordersChat.notifyError(<первая строка message>, 'Ошибка: ' + redactSecrets(...).slice(0, 300))`;
  - отвечает `texts.genericError`, если чат личный. Ошибку этого ответа он только логирует.

  `ordersChat` создаётся внутри `createBot` с `send = (t) => bot.api.sendMessage(config.ordersChatId, t)`.

- [ ] **Шаг 4: Проверить**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Шаг 5: Коммит**

`feat: bot core with private-only routing, error alerts, /terms and /paysupport`

---

### Задача 6: Главное меню, «О сервисе» и тарифы

**Файлы:**
- Создать: `src/bot/user/start.ts`, `src/bot/user/plans.ts`, `src/bot/callback-data.ts`
- Изменить: `src/bot/create-bot.ts` (подключить обработчики до запасного обработчика кнопок)
- Тест: `test/unit/bot/start.test.ts`, `test/unit/bot/plans.test.ts`, `test/unit/bot/callback-data.test.ts`

**Interfaces:**
- Consumes: `createHarness` (задача 5), функции `src/domain/*` (задача 1).
- Produces:
  ```ts
  // src/bot/callback-data.ts
  type MenuAction = 'start' | 'buy' | 'about' | 'my' | 'plans';
  const cb = { menu: (a: MenuAction) => `menu:${a}`, plan: (id: number) => `plan:${id}` };
  parsePlanId(data: string): number | null // 'plan:2' → 2; 'plan:abc', 'plan:-1', 'plan:' → null
  ```
  Кнопка `menu:my` в этом этапе только отображается. Её нажатие попадает в запасной обработчик, обработчик добавит этап 2.

Главное меню (`/start` с любым параметром или без) — `sendPhoto`:
- `caption`: `content.startText`, а при активной подписке ещё `\n\n` и `Подписка активна до ДД.ММ.ГГГГ`;
- `parse_mode: 'HTML'`;
- кнопки по строкам: `Купить подписку` (`menu:buy`) / `Каталог приложений` (url `links.catalog`) / `Отзывы` (url `links.reviews`) / `О сервисе` (`menu:about`) / `Поддержка` (url `links.support`) / `Моя подписка` (`menu:my`, только при активной подписке).

Первый `sendPhoto` загружает `content.startImage`. `file_id` из ответа запоминается в памяти, следующие `/start` отправляют его строкой.

- [ ] **Шаг 1: Написать падающие тесты**

`start.test.ts`:
- `/start` без подписки → `sendPhoto`, `caption === startText`, в клавиатуре 5 кнопок в порядке выше, `Моя подписка` нет;
- при `activeUntil = 2026-12-15T12:00:00Z` → `caption` заканчивается на `\n\nПодписка активна до 15.12.2026`, последняя кнопка — `Моя подписка`;
- при `activeUntil` в прошлом относительно часов харнесса кнопки `Моя подписка` нет;
- второй `/start` передаёт в `photo` строку `'photo-file-id'`, а не буфер;
- `/start paid_abc` ведёт себя как `/start`;
- `press('menu:about')` → `answerCallbackQuery` и `sendMessage` с `content.aboutText`, `parse_mode: 'HTML'`.

`plans.test.ts`:
- `press('menu:buy')` → `answerCallbackQuery` и `sendMessage` с текстом `Выберите срок подписки:`. Кнопки: `30 дней — 490 ₽` (`plan:1`), `90 дней — 1170 ₽` (`plan:2`), `180 дней — 1740 ₽` (`plan:3`), последняя — `Назад` (`menu:start`);
- все тарифы скрыты → текст `texts.noPlans` и кнопка `Поддержка`;
- `press('plan:2', { messageId: 7 })` → `editMessageText` у сообщения 7 с текстом `planScreenText(...)` для 90 дней, `parse_mode: 'HTML'`, `link_preview_options: { is_disabled: true }`, единственная кнопка `Назад` (`menu:plans`);
- `press('menu:plans', { messageId: 7 })` → `editMessageText` того же сообщения обратно на список тарифов;
- `press('menu:start')` → `sendPhoto` главного меню;
- `press('plan:999')` и `press('plan:abc')` → `answerCallbackQuery` с `texts.staleButton`, без `editMessageText`;
- тариф скрыт после показа списка (`press('plan:3')` при `enabled = false`) → то же, что для `plan:999`.

`callback-data.test.ts` — случаи `parsePlanId` из блока Interfaces.

- [ ] **Шаг 2: Запустить, убедиться в падении**

Run: `pnpm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать `start.ts`, `plans.ts`, `callback-data.ts`**

Каждый обработчик кнопки вызывает `answerCallbackQuery`. Если Telegram ответил на `editMessageText` ошибкой `message is not modified`, обработчик её игнорирует.

- [ ] **Шаг 4: Проверить**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Шаг 5: Коммит**

`feat: start menu, about and plan screens`

---

### Задача 7: Запуск процесса и проверка на тестовом боте

**Файлы:**
- Создать: `src/main.ts`
- Изменить: `README.md` (запуск и проверка)

**Interfaces:**
- Consumes: всё выше.

- [ ] **Шаг 1: Реализовать `src/main.ts`**

Порядок запуска:
1. `loadConfig(process.env)`. При `ConfigError` вывести `message` в stderr и выйти с кодом 1.
2. `createLogger(secretValues(config))`.
3. `loadContent(config.contentDir)`. При `ContentError` выйти так же.
4. `createPrisma` и `createServices`.
5. `createBot(config.botToken, { ...deps, clock: () => new Date() })`.
6. `bot.api.config.use(autoRetry())`.
7. `run(bot, { runner: { fetch: { allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'chat_join_request', 'my_chat_member'] } } })`.
8. Записать в лог `Бот запущен` с `botUsername`.

На `SIGINT` и `SIGTERM`: `await runner.stop()`, затем `prisma.$disconnect()`, затем выход с кодом 0.

- [ ] **Шаг 2: Проверить запуск без настроек**

Run: `node --env-file=/dev/null --import tsx src/main.ts` (в PowerShell — с пустым временным файлом вместо `/dev/null`)
Expected: код выхода 1, в stderr строка `Неверные или пустые настройки в .env:` со списком переменных, без значений.

- [ ] **Шаг 3: Полная проверка**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build`
Expected: всё PASS, `dist/main.js` создан.

- [ ] **Шаг 4: Ручная проверка на тестовом боте (вместе с владельцем)**

Нужен токен отдельного тестового бота, тестовый чат заказов и папка `content/` с картинкой. Владелец заполняет `.env` сам, токен в чат не пересылается. Ключи Platega и `CERT_ENCRYPTION_KEY` для этапа 1 можно заполнить тестовыми значениями нужного формата.

Run: `pnpm dev`

Проверить в Telegram:
- `/start` показывает картинку, текст и 5 кнопок;
- «Каталог приложений», «Отзывы» и «Поддержка» открывают ссылки;
- «О сервисе» присылает текст;
- «Купить подписку» → «90 дней — 1170 ₽» → «Подписка: 90 дней / Стоимость: 1170 ₽ (390 ₽ в месяц)», ссылка на оферту, «Назад» возвращает к списку;
- `/terms` и `/paysupport` отвечают;
- `/start` в чате заказов не вызывает ответа;
- в логе нет токена.

- [ ] **Шаг 5: Коммит**

`feat: process entry point with long polling and graceful shutdown`

После коммита — `superpowers:requesting-code-review` по всей ветке, затем вопрос владельцу о слиянии в `main` и пуше.
