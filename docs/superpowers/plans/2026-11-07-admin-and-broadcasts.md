# Этап 5 «Админка и рассылки»: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель:** `/admin` с разделами «Рассылка», «Подписчики», «Тарифы», «База»; бот собирает базу пользователей (`lastSeenAt`, `blockedAt`) и рассылает по ней любое сообщение с необязательной кнопкой-ссылкой.

**Архитектура:** логика в сервисах, обработчики тонкие (как в этапе 1). Сервисы админки — `src/admin/` (Prisma), рассылки — `src/broadcast/` (хранилище на Prisma и отправитель внутри процесса). Оба попадают в бот через `BotDeps` (`admin`, `broadcasts`), поэтому диалоги тестируются модульно на поддельных реализациях, а сервисы и отправитель — интеграционно на настоящей PostgreSQL с поддельным API Telegram. Чистые разборы ввода и форматирование — в `src/domain/`.

**Стек:** без новых зависимостей. grammY 1.46, Prisma 7, PostgreSQL 17, Vitest, Biome.

**Спецификация:** `docs/superpowers/specs/2026-11-06-xstorexbot-design.md`, разделы 9.3, 9.4, 9.5, 10.2, 10.3, 11, 17, 18 (этап 5).

## Глобальные ограничения

- Работа в ветке `admin-panel`. Каждая задача заканчивается коммитом; сообщение коммита заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Пушить и сливать только после подтверждения владельца.
- TDD: сначала падающий тест, потом код.
- Все тексты бота на русском, служебные — в `src/texts.ts` (группа `texts.admin`). Даты — `ДД.ММ.ГГГГ` по Москве через `formatDateMsk`.
- Суммы в копейках, время в UTC. Часы только через `deps.clock()` / параметр `now`, не `new Date()` в логике.
- Секреты не попадают в git, логи и тексты ошибок. В `AdminLog.details` и в поле `BroadcastRecipient.error` — только код и описание ошибки Telegram, без URL запроса.
- Интеграционные тесты только на настоящей PostgreSQL 17 (`127.0.0.1:5433`, `pnpm db:up`).
- Экраны админки — обычные текстовые сообщения без `parse_mode` (имена и @username выводятся как есть, экранировать не нужно) и сменяются через тот же экземпляр `Screens`, что и экраны покупателя.
- Префикс `callback_data` админки — `adm:`. Длина любой `callback_data` ≤ 64 байт.
- **Не входит в этап:** «Вернуть деньги» (этапы 2–3), «Заявки» (этап 4), удаление из канала после «Завершить подписку» (этап 6), отложенные рассылки и сегменты.

## На что смотреть при ревью

1. **Потеря связи во время рассылки.** Сетевая ошибка (`HttpError`, не ответ Telegram) не должна помечать получателей `FAILED` пачкой: отправитель ждёт 5 секунд и повторяет того же получателя. Тест — задача 10.
2. **Кнопки админки после перезапуска.** Состояние ввода живёт в памяти. «Отправить», «Добавить кнопку», «Без кнопки» без черновика отвечают «Кнопка устарела, нажмите /start» и ничего не рассылают. Тест — задача 11.
3. **Не админ.** `/admin` от не админа — тишина; кнопка `adm:*` от не админа — «Кнопка устарела», без данных админки. Тест — задача 5.
4. **Команда посреди ввода.** `/start` или `/admin`, пока бот ждёт число или сообщение для рассылки, отменяет ввод; следующее сообщение админа не считается ответом. Тест — задача 5.
5. **Альбом в рассылку.** Каждая часть альбома приходит отдельным сообщением с `media_group_id`; все отклоняются, бот остаётся в ожидании одного сообщения. Тест — задача 11.

---

### Задача 1: Схема базы

**Файлы:**
- Изменить: `prisma/schema.prisma`
- Создать: `prisma/migrations/<время>_admin_broadcasts/migration.sql`
- Изменить: `test/int/helpers/db.ts` (`resetDb` очищает и новые таблицы)
- Тест: `test/int/schema.test.ts`

**Interfaces:**
- Produces: модели `Broadcast`, `BroadcastRecipient`, перечисления `BroadcastStatus` (`RUNNING`, `DONE`, `STOPPED`, `FAILED`) и `RecipientStatus` (`PENDING`, `SENT`, `BLOCKED`, `FAILED`); поле `User.lastSeenAt DateTime @default(now()) @db.Timestamptz(3)`.

- [ ] **Шаг 1: Падающие тесты в `test/int/schema.test.ts`**

```ts
it('вторая рассылка RUNNING запрещена индексом', async () => {
  const data = { adminId: 1n, sourceChatId: 1n, sourceMessageId: 1, total: 0 };
  await prisma.broadcast.create({ data });
  await expect(prisma.broadcast.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.broadcast.create({ data: { ...data, status: 'DONE' } }); // не мешает
});
it('у нового пользователя lastSeenAt заполнен', async () => {
  const u = await prisma.user.create({ data: { id: 1n, firstName: 'А' } });
  expect(u.lastSeenAt).toBeInstanceOf(Date);
});
it('есть индекс по lower(username)', async () => {
  const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'User'`);
  expect(rows.some((r) => r.indexdef.includes('lower'))).toBe(true);
});
```

- [ ] **Шаг 2: `pnpm test:int` — падают (нет модели и поля)**

- [ ] **Шаг 3: Схема и миграция**

`Broadcast`: `id Int @id @default(autoincrement())`, `adminId BigInt`, `sourceChatId BigInt`, `sourceMessageId Int`, `buttonText String?`, `buttonUrl String?`, `status BroadcastStatus @default(RUNNING)`, `total Int`, `progressMessageId Int?`, `createdAt @default(now())`, `finishedAt DateTime?` (оба `Timestamptz(3)`), связь `recipients BroadcastRecipient[]`.
`BroadcastRecipient`: `broadcastId Int`, `userId BigInt`, `status RecipientStatus @default(PENDING)`, `error String?`, `sentAt DateTime? @db.Timestamptz(3)`, `@@id([broadcastId, userId])`, `@@index([broadcastId, status])`, связи на `Broadcast` и `User` (`onDelete: Cascade` от `Broadcast`).

`pnpm exec prisma migrate dev --create-only --name admin_broadcasts`, затем дописать в конец SQL:

```sql
CREATE UNIQUE INDEX "Broadcast_one_running" ON "Broadcast" ((true)) WHERE "status" = 'RUNNING';
CREATE INDEX "User_username_lower_idx" ON "User" (lower("username"));
```

Применить `pnpm db:migrate`. В `resetDb` добавить `"Broadcast", "BroadcastRecipient"` в `TRUNCATE`.

- [ ] **Шаг 4: `pnpm typecheck && pnpm test:int` — проходят**

- [ ] **Шаг 5: Коммит** `feat: schema for user base and broadcasts`

---

### Задача 2: База пользователей

**Файлы:**
- Изменить: `src/services/users.ts`, `src/services/index.ts`, `src/bot/middleware.ts`, `src/bot/create-bot.ts`
- Создать: `src/bot/user/chat-member.ts`
- Изменить: `test/unit/helpers/harness.ts` (`FakeServices`, хелпер `chatMember`)
- Тест: `test/int/services.test.ts`, `test/unit/bot/chat-member.test.ts`, `test/unit/bot/commands.test.ts`

**Interfaces:**
- Produces (в `Services`):
  - `touchUser(from: TelegramFrom, now: Date): Promise<void>` — upsert, `lastSeenAt = now`, `blockedAt = null`.
  - `setBlocked(from: TelegramFrom, blockedAt: Date | null): Promise<void>` — upsert; при создании `lastSeenAt` по умолчанию.
  - `markBlocked(userId: number, now: Date): Promise<void>` — `updateMany` по id (нет строки — ничего не делает). Используется при 403 вне рассылки.
- Produces (харнесс): `h.chatMember(status: 'kicked' | 'member', from?)` подаёт `my_chat_member` из лички; `FakeServices.blocked: Map<number, Date | null>` записывает вызовы `setBlocked`/`markBlocked`.

- [ ] **Шаг 1: Падающие тесты**

int: `touchUser` ставит `lastSeenAt = now` и обновляет его при повторном вызове с другим `now`; `setBlocked(from, now)` ставит отметку, `setBlocked(from, null)` снимает; `setBlocked` для нового id создаёт пользователя; `markBlocked` для неизвестного id не падает.

unit:
```ts
it('my_chat_member kicked ставит blockedAt и не трогает lastSeenAt', async () => {
  const h = createHarness();
  await h.chatMember('kicked');
  expect(h.services.blocked.get(42)).toEqual(h.now.value);
  expect(h.services.users).toHaveLength(0); // touchUser не вызывался
});
it('my_chat_member member снимает blockedAt', async () => {
  const h = createHarness();
  await h.chatMember('member');
  expect(h.services.blocked.get(42)).toBeNull();
});
```
В `commands.test.ts` ожидание вызова `touchUser` дополняется вторым аргументом `h.now.value` (фейк хранит `{ from, now }` или проверяется отдельно — на выбор исполнителя, но `now` должно проверяться).

- [ ] **Шаг 2: `pnpm test && pnpm test:int` — падают**

- [ ] **Шаг 3: Реализация**

`touchUserMiddleware(services, clock)` вызывает `touchUser` только для `ctx.message` и `ctx.callbackQuery` (спецификация 9.5: «пишет боту или нажимает кнопки»). Иначе `my_chat_member` с `kicked` сначала снимал бы отметку. `registerChatMember(priv, deps)` в `src/bot/user/chat-member.ts`: `priv.on('my_chat_member', …)` — `new_chat_member.status === 'kicked'` → `setBlocked(from, clock())`, `'member'` → `setBlocked(from, null)`, иное — ничего.

- [ ] **Шаг 4: `pnpm test && pnpm test:int` — проходят**

- [ ] **Шаг 5: Коммит** `feat: track lastSeenAt and blocked users`

---

### Задача 3: Чистые функции админки

**Файлы:**
- Создать: `src/domain/admin.ts`, `src/domain/subscription.ts`
- Изменить: `src/texts.ts`
- Тест: `test/unit/domain/admin.test.ts`, `test/unit/domain/subscription.test.ts`

**Interfaces:**
- Produces (`src/domain/subscription.ts`):
  - `extendEndsAt(current: Date | null, now: Date, days: number): Date` — `max(now, current) + days × 24 ч` (7.5).
- Produces (`src/domain/admin.ts`):
  - `type SubscriberQuery = { id: number } | { username: string }`; `parseSubscriberQuery(text: string): SubscriberQuery | null` — после `trim`: `^\d{1,15}$` → id; `^@?[A-Za-z0-9_]{4,32}$` → username без `@`; иначе `null`.
  - `parseDays(text: string): number | null` — целое 1…3650.
  - `parseRubToKopecks(text: string): number | null` — целое 1…1 000 000 рублей, пробелы внутри числа допускаются (`1 000`), результат × 100.
  - `parseStars(text: string): number | null | 'clear'` — `-` → `'clear'`, целое 1…100 000, иначе `null`.
  - `parseButton(text: string): { text: string; url: string } | null` — делится по первому `|`, обе части `trim`; название 1…64 символа, адрес `^https://\S+$`.
  - `type PlanAdminView = PlanView & { enabled: boolean }`; `planAdminLine(p: PlanAdminView): string`.
  - `type PaymentLine = { createdAt: Date; provider: 'PLATEGA' | 'STARS' | 'MANUAL'; amount: number; currency: 'RUB' | 'XTR'; status: 'PENDING' | 'PAID' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'CHARGEBACK' }`.
  - `type SubscriberCard = { id: number; firstName: string; username: string | null; createdAt: Date; lastSeenAt: Date; blockedAt: Date | null; endsAt: Date | null; payments: PaymentLine[] }`.
  - `subscriberCardText(card: SubscriberCard, now: Date): string`.
  - `type BaseStats = { users: number; reachable: number; blocked: number; active: number }`; `baseStatsText(s: BaseStats): string`.

- [ ] **Шаг 1: Падающие тесты** (значения из спецификации 9.3)

```ts
expect(planAdminLine({ id: 1, days: 30, priceRub: 49000, priceStars: null, enabled: true }))
  .toBe('30 дней · 490 ₽ · ⭐ не задана · включён');
expect(planAdminLine({ id: 3, days: 180, priceRub: 174000, priceStars: 990, enabled: false }))
  .toBe('180 дней · 1740 ₽ · ⭐ 990 · скрыт');

const now = new Date('2026-11-06T12:00:00Z');
expect(subscriberCardText({
  id: 123456789, firstName: 'Иван', username: 'ivan',
  createdAt: new Date('2026-11-01T10:00:00Z'), lastSeenAt: now, blockedAt: null,
  endsAt: new Date('2026-12-15T10:00:00Z'),
  payments: [
    { createdAt: now, provider: 'STARS', amount: 290, currency: 'XTR', status: 'PAID' },
    { createdAt: new Date('2026-11-01T10:00:00Z'), provider: 'MANUAL', amount: 0, currency: 'RUB', status: 'PAID' },
  ],
}, now)).toBe(
  'Иван (@ivan), ID 123456789\nПервый визит: 01.11.2026, последний: 06.11.2026\n' +
  'Подписка до 15.12.2026\nЗаблокировал бота: нет\n\nПлатежи:\n' +
  '06.11.2026 · Stars · 290 ⭐ · оплачен\n01.11.2026 · вручную · 0 ₽ · оплачен');
```
Ещё случаи карточки: без username → `Иван, ID 1`; `endsAt = null` → «Подписки нет»; `endsAt` в прошлом → «Подписка закончилась 01.11.2026»; `blockedAt` задан → «Заблокировал бота: да»; без платежей → блок «Платежи:» заменяется строкой «Платежей нет».
Названия: `PLATEGA` «Platega», `STARS` «Stars», `MANUAL` «вручную»; статусы `PENDING` «ожидает», `PAID` «оплачен», `CANCELED` «отменён», `EXPIRED` «истёк», `REFUNDED` «возвращён», `CHARGEBACK` «чарджбэк».

`baseStatsText({ users: 1250, reachable: 1180, blocked: 70, active: 312 })` → `'Пользователей: 1250\nПолучат рассылку: 1180\nЗаблокировали бота: 70\nС активной подпиской: 312'`.

Разборы ввода — `it.each` по границам: `parseDays` `'1'`→1, `'3650'`→3650, `'0'`, `'3651'`, `'1.5'`, `'-3'`, `'abc'`, `''`→null; `parseRubToKopecks('490')`→49000, `'1 000'`→100000, `'1000001'`→null; `parseStars('-')`→`'clear'`, `'100001'`→null; `parseButton('Каталог | https://x.ru')`→`{ text: 'Каталог', url: 'https://x.ru' }`, `'| https://x.ru'`, `'Текст | http://x.ru'`, `'Текст'`, название из 65 символов → null; `parseSubscriberQuery('@IVAN')`→`{ username: 'IVAN' }`, `'123'`→`{ id: 123 }`, `'иван'`→null.

`extendEndsAt`: `null` и прошедшая дата считаются от `now`; будущая — от неё.

- [ ] **Шаг 2: `pnpm test` — падают**

- [ ] **Шаг 3: Реализация** функций и текстов. Обращение к `subscriberCardText` и `planAdminLine` через `formatDateMsk`, `formatRub`.

- [ ] **Шаг 4: `pnpm test` — проходят**

- [ ] **Шаг 5: Коммит** `feat: admin input parsing and card formatting`

---

### Задача 4: Сервисы админки

**Файлы:**
- Создать: `src/admin/index.ts`, `src/admin/plans.ts`, `src/admin/subscribers.ts`, `src/admin/stats.ts`, `src/admin/log.ts`
- Тест: `test/int/admin.test.ts`

**Interfaces:**
- Consumes: `extendEndsAt`, `SubscriberQuery`, `SubscriberCard`, `PlanAdminView`, `BaseStats` (задача 3).
- Produces:
```ts
export interface AdminServices {
  listAllPlans(): Promise<PlanAdminView[]>;              // по sort, включая скрытые
  getPlan(id: number): Promise<PlanAdminView | null>;
  setPlanPriceRub(adminId: number, planId: number, kopecks: number): Promise<void>;
  setPlanPriceStars(adminId: number, planId: number, stars: number | null): Promise<void>;
  setPlanEnabled(adminId: number, planId: number, enabled: boolean): Promise<void>;
  findUserId(query: SubscriberQuery): Promise<number | null>;
  getSubscriberCard(userId: number): Promise<SubscriberCard | null>; // 10 последних платежей, новые сверху
  addDays(adminId: number, userId: number, days: number, now: Date): Promise<{ endsAt: Date; paymentId: string }>;
  endSubscription(adminId: number, userId: number, now: Date): Promise<boolean>; // false, если подписка не активна
  baseStats(now: Date): Promise<BaseStats>;
}
export function createAdminServices(prisma: PrismaClient): AdminServices;
```
- Produces (`src/admin/log.ts`): `writeAdminLog(tx, { adminId, action, targetUserId?, details })` — используется и в задаче 9.

- [ ] **Шаг 1: Падающие тесты в `test/int/admin.test.ts`**
  - `findUserId({ username: 'IVAN' })` находит `ivan`; `{ id }` находит существующего и возвращает `null` для неизвестного; пользователь без username по username не находится.
  - `addDays(1, 42, 10, now)` без подписки → `endsAt = now + 10 дней`; с активной подпиской до `now + 5 дней` → `now + 15 дней`; сбрасывает `reminded3dAt`, `reminded1dAt`, `removedAt`, `removeAttempts = 0`; создаёт платёж `MANUAL`, `amount 0`, `currency RUB`, `status PAID`, `days 10`, `planId null`, `paidAt = appliedAt = now`, `createdByAdminId 1`; пишет `AdminLog` `subscription.add_days` с `details` `{ days: 10, oldEndsAt, newEndsAt, paymentId }` (даты ISO-строками) и `targetUserId 42`.
  - `endSubscription` у активной: `endsAt = now`, лог `subscription.end` `{ oldEndsAt }`, `true`; у закончившейся и отсутствующей — `false`, лога нет.
  - `getSubscriberCard` отдаёт 10 платежей из 12, новые первыми; `null` для неизвестного.
  - `setPlanPriceRub` меняет цену и пишет `plan.price_rub` `{ planId, old, new }`; `setPlanPriceStars(…, null)` очищает и пишет `plan.price_stars`; `setPlanEnabled(…, false)` скрывает и пишет `plan.enabled` `{ planId, enabled: false }`; `listAllPlans` показывает скрытый.
  - `baseStats`: 3 пользователя, один с `blockedAt`, один с активной подпиской, один с закончившейся → `{ users: 3, reachable: 2, blocked: 1, active: 1 }`.

- [ ] **Шаг 2: `pnpm test:int` — падают**

- [ ] **Шаг 3: Реализация.** Поиск по username — `$queryRaw` с `WHERE lower("username") = lower(${u})`, чтобы работал индекс. `addDays` и `endSubscription` — в `prisma.$transaction`, подписка читается внутри транзакции с `SELECT … FOR UPDATE` (`$queryRaw`), чтобы два нажатия не потеряли дни. Изменения тарифов и запись в журнал — в одной транзакции.

- [ ] **Шаг 4: `pnpm test:int` — проходят**

- [ ] **Шаг 5: Коммит** `feat: admin services for plans, subscribers and stats`

---

### Задача 5: `/admin`, права, ввод и раздел «База»

**Файлы:**
- Создать: `src/bot/admin/index.ts` (`registerAdmin`), `src/bot/admin/input.ts`, `src/bot/admin/menu.ts`
- Изменить: `src/bot/create-bot.ts` (`BotDeps.admin`, `BotDeps.broadcasts`, регистрация до `registerStart`), `src/bot/callback-data.ts`, `src/texts.ts`
- Изменить: `test/unit/helpers/harness.ts`
- Тест: `test/unit/bot/admin.test.ts`

**Interfaces:**
- Consumes: `AdminServices` (задача 4); тип `Broadcasts` (задача 10) — здесь объявить интерфейс в `src/broadcast/types.ts` (тело — задача 10):
```ts
export type BroadcastButton = { text: string; url: string };
export interface BroadcastSummary { id: number; status: 'RUNNING' | 'DONE' | 'STOPPED' | 'FAILED'; total: number; sent: number; blocked: number; failed: number; pending: number; createdAt: Date; finishedAt: Date | null }
export interface Broadcasts {
  countRecipients(): Promise<number>;
  current(): Promise<BroadcastSummary | null>;   // идущая, иначе последняя, иначе null
  start(input: { adminId: number; sourceChatId: number; sourceMessageId: number; button: BroadcastButton | null }):
    Promise<{ ok: true; id: number; total: number } | { ok: false; reason: 'running' }>;
  stop(adminId: number, broadcastId: number): Promise<boolean>; // false, если уже не идёт
  resume(): Promise<void>;
  idle(): Promise<void>; // ждёт окончания текущего цикла отправки (тесты, остановка)
}
```
- Produces:
  - `isAdmin(config: Config, userId: number | undefined): boolean`.
  - `class AdminInput` — `get(userId)`, `set(userId, state: InputState)`, `clear(userId)`; `InputState` — объединение `{ kind: 'subscriberQuery' } | { kind: 'addDays'; userId: number } | { kind: 'priceRub'; planId: number } | { kind: 'priceStars'; planId: number } | { kind: 'broadcastMessage' } | { kind: 'broadcastButtonChoice'; source: Source } | { kind: 'broadcastButton'; source: Source } | { kind: 'broadcastConfirm'; source: Source; button: BroadcastButton | null }`, `Source = { chatId: number; messageId: number }`.
  - `cb.admin(path: string): string` → `adm:${path}`. Маршруты: `adm:menu`, `adm:base`, `adm:plans`, `adm:plan:<id>`, `adm:plan:<id>:rub|stars|toggle`, `adm:subs`, `adm:sub:<id>`, `adm:sub:<id>:days|end|endok`, `adm:bc`, `adm:bc:new|btn|nobtn|send|cancel`, `adm:bc:stop:<id>`.
  - `showAdminMenu(ctx, screens)` — экран «Админка», кнопки `[Рассылка, Подписчики]`, `[Тарифы, База]`.
  - Обработчики разделов в задачах 6, 7, 11 регистрируются функциями `registerPlansSection`, `registerSubscribersSection`, `registerBroadcastSection(composer, deps, screens, input)` и функцией ввода `onInput(kind, handler)` из `src/bot/admin/input.ts` (один обработчик `message` на админа маршрутизирует по `input.get(from.id).kind`).
- Produces (харнесс): `FakeAdminServices` и `FakeBroadcasts` (записывают вызовы, данные настраиваются полями), `press(data, { from?, messageId?, photo? })` (чат = `from.id`), `sendMessage(partial: Partial<Message>, from?)` для фото, альбомов и т. п.; поддельный API возвращает `message_id` и для `copyMessage`. Админ в тестах — `{ id: 1 }` (`testConfig().adminIds`).

- [ ] **Шаг 1: Падающие тесты в `test/unit/bot/admin.test.ts`**
```ts
it('/admin у админа удаляет команду и показывает меню', async () => {
  const h = createHarness();
  await h.sendText('/admin', { from: { id: 1 } });
  expect(deleted(h.calls)).toContain(2);
  const menu = h.calls.find((c) => c.method === 'sendMessage');
  expect(menu?.payload.text).toBe('Админка');
  expect(rowTexts(menu?.payload ?? {})).toEqual([['Рассылка', 'Подписчики'], ['Тарифы', 'База']]);
});
it('/admin не админу — тишина', async () => { /* from 42: нет sendMessage и deleteMessage */ });
it('adm:base от не админа — «Кнопка устарела», счётчики не читаются', async () => { /* … */ });
it('«База» показывает счётчики и «‹ Назад» → adm:menu', async () => {
  // FakeAdminServices.stats = { users: 1250, reachable: 1180, blocked: 70, active: 312 }
  // текст === baseStatsText(stats), кнопки [{ '‹ Назад', 'adm:menu' }], экран меню удалён
});
it('команда отменяет начатый ввод', async () => {
  // press adm:subs (ввод subscriberQuery), sendText('/start', admin), sendText('ivan', admin)
  // → findUserId не вызывался
});
```

- [ ] **Шаг 2: `pnpm test` — падают**

- [ ] **Шаг 3: Реализация.** `registerAdmin(priv, deps, screens)`: `const adm = priv.filter((ctx) => isAdmin(deps.config, ctx.from?.id))`. Первым — middleware: сообщение, начинающееся с `/`, очищает ввод и идёт дальше. `/admin`: удалить сообщение команды (ошибку `GrammyError` игнорировать), `screens.show(ctx, …)`. Обработчик ввода регистрируется последним внутри `adm` и при отсутствии состояния вызывает `next()`. Не админу `adm:*` попадает в существующий обработчик устаревших кнопок.

- [ ] **Шаг 4: `pnpm lint && pnpm typecheck && pnpm test` — проходят**

- [ ] **Шаг 5: Коммит** `feat: /admin menu, admin input state and base stats`

---

### Задача 6: Раздел «Тарифы»

**Файлы:**
- Создать: `src/bot/admin/plans.ts`
- Изменить: `src/texts.ts`
- Тест: `test/unit/bot/admin-plans.test.ts`

**Interfaces:**
- Consumes: `AdminServices.listAllPlans/getPlan/setPlan*`, `planAdminLine`, `parseRubToKopecks`, `parseStars`, `AdminInput`.

Тексты: список — `'Тарифы:\n' + строки planAdminLine`, кнопка на каждый тариф `'30 дней'` → `adm:plan:<id>`, затем «‹ Назад» → `adm:menu`. Карточка — `planAdminLine(plan)`, кнопки `[Цена ₽, Цена ⭐]`, `[Скрыть | Включить]`, `[‹ Назад → adm:plans]`. Приглашения: «Новая цена в рублях: целое число от 1 до 1 000 000», «Новая цена в звёздах: целое число от 1 до 100 000 или «-», чтобы убрать». Неверный ввод: «Нужно целое число от 1 до 1 000 000» / «Нужно целое число от 1 до 100 000 или «-»» обычным сообщением, ввод не сбрасывается.

- [ ] **Шаг 1: Падающие тесты**
  - `adm:plans` показывает три строки и кнопки тарифов.
  - `adm:plan:1:rub` → приглашение; `'abc'` → «Нужно целое число от 1 до 1 000 000», `setPlanPriceRub` не вызван; `'590'` → `setPlanPriceRub(1, 1, 59000)` и карточка тарифа снова.
  - `adm:plan:1:stars` → `'-'` → `setPlanPriceStars(1, 1, null)`.
  - `adm:plan:1:toggle` у включённого → `setPlanEnabled(1, 1, false)`, карточка с кнопкой «Включить».
  - `adm:plan:999` → «Кнопка устарела, нажмите /start».

- [ ] **Шаг 2: `pnpm test` — падают**
- [ ] **Шаг 3: Реализация**
- [ ] **Шаг 4: `pnpm test` — проходят**
- [ ] **Шаг 5: Коммит** `feat: admin plans section`

---

### Задача 7: Раздел «Подписчики»

**Файлы:**
- Создать: `src/bot/admin/subscribers.ts`
- Изменить: `src/texts.ts`
- Тест: `test/unit/bot/admin-subscribers.test.ts`

**Interfaces:**
- Consumes: `AdminServices.findUserId/getSubscriberCard/addDays/endSubscription`, `Services.markBlocked`, `parseSubscriberQuery`, `parseDays`, `subscriberCardText`.

Тексты: «Пришлите @username или Telegram ID»; неверный формат — «Пришлите @username или числовой Telegram ID»; не найден — «Не найден. Человек должен хотя бы раз написать боту» (ввод продолжается). Карточка: `subscriberCardText`, кнопки `[Добавить дни]`, `[Завершить подписку]` (только если `endsAt > now`), `[‹ Назад → adm:menu]`. «Сколько дней добавить? Целое число от 1 до 3650»; неверно — «Нужно целое число от 1 до 3650». Подтверждение: «Завершить подписку @ivan сейчас? Деньги не возвращаются» (без username — `Иван`), кнопки `[Да, завершить → adm:sub:<id>:endok]`, `[Отмена → adm:sub:<id>]`. Покупателю: «Подписка продлена до 15.12.2026» с кнопкой-ссылкой «Вступить в канал» → `config.channelInviteLink`.

- [ ] **Шаг 1: Падающие тесты**
  - `adm:subs`, затем `'@Ivan'` → `findUserId({ username: 'Ivan' })`, показана карточка с «Добавить дни» и «Завершить подписку».
  - неизвестный → «Не найден…», следующий ввод снова ищет.
  - `adm:sub:42:days`, `'0'` → «Нужно целое число от 1 до 3650»; `'30'` → `addDays(1, 42, 30, now)`, покупателю `sendMessage` в чат 42 с текстом «Подписка продлена до …» и url-кнопкой, затем карточка заново.
  - покупатель заблокировал бота (поддельный API бросает `GrammyError` 403 на `sendMessage` в чат 42) → `markBlocked(42, now)`, карточка всё равно показана, ошибка админу не уходит.
  - `adm:sub:42:end` → подтверждение; `adm:sub:42:endok` → `endSubscription(1, 42, now)` и карточка без кнопки «Завершить подписку».
  - у подписчика без активной подписки кнопки «Завершить подписку» нет.

- [ ] **Шаг 2: `pnpm test` — падают**
- [ ] **Шаг 3: Реализация.** Другие ошибки отправки покупателю (не 403) пробрасываются в общий обработчик ошибок после показа карточки.
- [ ] **Шаг 4: `pnpm test` — проходят**
- [ ] **Шаг 5: Коммит** `feat: admin subscribers section with add days and end`

---

### Задача 8: Чистые функции рассылки

**Файлы:**
- Создать: `src/domain/broadcast.ts`
- Тест: `test/unit/domain/broadcast.test.ts`

**Interfaces:**
- Produces:
  - `isBroadcastable(msg: Message): boolean` — `true` для `text`, `photo`, `video`, `animation`, `document`, `audio`, `voice` без `media_group_id`; `false` для остального (стикер, опрос, контакт, видеокружок, альбом).
  - `progressText(sent: number, total: number): string` → `'Рассылка: отправлено 640 из 1180'`, где `sent` — обработанные (SENT + BLOCKED + FAILED).
  - `reportText(s: BroadcastSummary): string`.
  - `classifySendError(err: unknown): { kind: 'blocked' } | { kind: 'retry'; afterMs: number } | { kind: 'sourceGone' } | { kind: 'failed'; error: string }` — `GrammyError` 403 → blocked; 429 → retry `parameters.retry_after × 1000`; 400 с описанием, содержащим `message to copy not found` → sourceGone; другой `GrammyError` → failed `'<код> <описание>'` (до 200 символов); `HttpError` → retry 5000; прочее — пробросить.

- [ ] **Шаг 1: Падающие тесты**
```ts
expect(reportText({ status: 'DONE', sent: 1150, blocked: 25, failed: 5, pending: 0, … }))
  .toBe('Рассылка завершена.\nДоставлено: 1150\nЗаблокировали бота: 25\nОшибки: 5');
expect(reportText({ status: 'STOPPED', sent: 10, blocked: 1, failed: 0, pending: 89, … }))
  .toBe('Рассылка остановлена\nДоставлено: 10\nЗаблокировали бота: 1\nОшибки: 0\nНе отправлено: 89');
expect(reportText({ status: 'FAILED', sent: 3, blocked: 0, failed: 0, pending: 7, … }))
  .toBe('Рассылка прервана: исходное сообщение удалено\nДоставлено: 3\nЗаблокировали бота: 0\nОшибки: 0\nНе отправлено: 7');
```
плюс `it.each` для `isBroadcastable` и `classifySendError` по каждому случаю выше.

- [ ] **Шаг 2: `pnpm test` — падают**
- [ ] **Шаг 3: Реализация**
- [ ] **Шаг 4: `pnpm test` — проходят**
- [ ] **Шаг 5: Коммит** `feat: broadcast message rules, report and error classification`

---

### Задача 9: Хранилище рассылок

**Файлы:**
- Создать: `src/broadcast/store.ts`
- Тест: `test/int/broadcast-store.test.ts`

**Interfaces:**
- Consumes: `writeAdminLog` (задача 4), `BroadcastSummary`, `BroadcastButton` (задача 5).
- Produces:
```ts
export interface BroadcastStore {
  countRecipients(): Promise<number>;                         // User без blockedAt
  create(input: { adminId: number; sourceChatId: number; sourceMessageId: number; button: BroadcastButton | null }, now: Date):
    Promise<{ ok: true; id: number; total: number } | { ok: false; reason: 'running' }>;
  get(id: number): Promise<{ id: number; adminId: number; sourceChatId: number; sourceMessageId: number; button: BroadcastButton | null; status: BroadcastSummary['status']; progressMessageId: number | null } | null>;
  running(): Promise<number | null>;                          // id RUNNING
  summary(id: number): Promise<BroadcastSummary>;
  latest(): Promise<BroadcastSummary | null>;                 // RUNNING, иначе последняя по createdAt
  pending(id: number, limit: number): Promise<number[]>;      // userId PENDING, по userId
  markSent(id: number, userId: number, now: Date): Promise<void>;
  markBlocked(id: number, userId: number, now: Date): Promise<void>; // и User.blockedAt = now
  markFailed(id: number, userId: number, error: string): Promise<void>;
  setProgressMessage(id: number, messageId: number): Promise<void>;
  finish(id: number, status: 'DONE' | 'FAILED', now: Date): Promise<void>; // только из RUNNING
  stop(adminId: number, id: number, now: Date): Promise<boolean>;          // RUNNING → STOPPED + лог
}
export function createBroadcastStore(prisma: PrismaClient): BroadcastStore;
```

- [ ] **Шаг 1: Падающие тесты**
  - снимок: 3 пользователя, один заблокирован → `create` даёт `total 2`, две строки `PENDING`; пользователь, созданный после, в рассылку не попадает.
  - вторая `create` при идущей → `{ ok: false, reason: 'running' }`, лишних строк нет; два параллельных `create` (`Promise.all`) → ровно один `ok`.
  - `create` пишет `broadcast.start` `{ broadcastId, total }`; `stop` пишет `broadcast.stop` `{ broadcastId, total }` и возвращает `false` для уже законченной.
  - `markBlocked` ставит статус `BLOCKED` и `User.blockedAt`.
  - `summary` считает `sent/blocked/failed/pending`; `finish` не трогает `STOPPED`.

- [ ] **Шаг 2: `pnpm test:int` — падают**
- [ ] **Шаг 3: Реализация.** `create` — `prisma.$transaction`: вставка `Broadcast`, затем `INSERT INTO "BroadcastRecipient" ("broadcastId","userId") SELECT $1, "id" FROM "User" WHERE "blockedAt" IS NULL`, `total` = число вставленных строк, лог. Ошибка `P2002` (индекс одной рассылки) → `{ ok: false, reason: 'running' }`.
- [ ] **Шаг 4: `pnpm test:int` — проходят**
- [ ] **Шаг 5: Коммит** `feat: broadcast store with recipient snapshot`

---

### Задача 10: Отправитель рассылок

**Файлы:**
- Создать: `src/broadcast/sender.ts`, `src/broadcast/index.ts`
- Тест: `test/int/broadcast-sender.test.ts`

**Interfaces:**
- Consumes: `BroadcastStore` (задача 9), `classifySendError`, `progressText`, `reportText` (задача 8), `Broadcasts` (задача 5).
- Produces:
```ts
export type SenderApi = Pick<Api, 'copyMessage' | 'sendMessage' | 'editMessageText'>;
export function createBroadcasts(opts: {
  store: BroadcastStore;
  api: () => SenderApi;            // ленивый: бот создаётся после
  clock: () => Date;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;   // по умолчанию setTimeout
  ratePerSecond?: number;                   // 25
  progressIntervalMs?: number;              // 5000
}): Broadcasts;
```

Поведение:
- `start` → `store.create`; при успехе отправляет админу `progressText(0, total)` с кнопкой «Остановить» (`adm:bc:stop:<id>`), сохраняет `progressMessageId`, запускает цикл без ожидания.
- Цикл: пачки по 100 из `pending`; на каждого `copyMessage(userId, sourceChatId, sourceMessageId, { reply_markup })` (url-кнопка, если задана), затем `sleep(1000 / ratePerSecond)`. Перед каждой отправкой проверяется флаг остановки в памяти. Ответы — по `classifySendError`: blocked → `markBlocked`; retry → `sleep(afterMs)` и тот же получатель; sourceGone → `finish(FAILED)`; failed → `markFailed`.
- Прогресс: `editMessageText` не чаще раза в `progressIntervalMs` по `clock()`; ошибки правки игнорируются.
- Конец: `finish(DONE)` (если не остановлена и не прервана), финальная правка прогресса без кнопки, затем отчёт `reportText(summary)` новым сообщением админу.
- `stop` → `store.stop`, флаг остановки; отчёт отправляет цикл, когда заметит флаг.
- `resume` → если есть `running()`, продолжает её цикл с теми же `progressMessageId`.
- Неожиданная ошибка в цикле логируется, цикл завершается, рассылка остаётся `RUNNING` (продолжится после перезапуска); необработанного отказа промиса нет.

- [ ] **Шаг 1: Падающие тесты** (поддельный `SenderApi` пишет вызовы и бросает заданные ошибки; `sleep` сдвигает поддельные часы и записывает задержки)
  - 3 получателя → три `copyMessage` с `from_chat_id = sourceChatId`, все `SENT`, статус `DONE`, последнее сообщение админу — `'Рассылка завершена.\nДоставлено: 3\nЗаблокировали бота: 0\nОшибки: 0'`.
  - задержка между отправками ≥ 40 мс.
  - 403 у одного → `BLOCKED` и `User.blockedAt`; 400 «Bad Request: chat not found» → `FAILED` с `error` `'400 Bad Request: chat not found'`.
  - 429 с `retry_after: 3` → сон 3000 мс, тот же получатель отправлен повторно и `SENT`.
  - `HttpError` у первого раза → сон 5000 мс, получатель потом `SENT`, `FAILED` нет.
  - 400 «message to copy not found» → рассылка `FAILED`, остальные `PENDING`, отчёт «Рассылка прервана…».
  - `stop` после первой отправки (из `copyMessage`-хука) → `STOPPED`, остальные `PENDING`, отчёт «Рассылка остановлена…».
  - 260 получателей: интервал между правками прогресса по поддельным часам ≥ 5000 мс.
  - `resume`: рассылка `RUNNING`, 1 из 3 уже `SENT` → отправляются только 2.
  Каждый тест ждёт `broadcasts.idle()`.

- [ ] **Шаг 2: `pnpm test:int` — падают**
- [ ] **Шаг 3: Реализация**
- [ ] **Шаг 4: `pnpm test:int` — проходят**
- [ ] **Шаг 5: Коммит** `feat: rate-limited broadcast sender with resume and stop`

---

### Задача 11: Раздел «Рассылка» в боте

**Файлы:**
- Создать: `src/bot/admin/broadcast.ts`
- Изменить: `src/texts.ts`
- Тест: `test/unit/bot/admin-broadcast.test.ts`

**Interfaces:**
- Consumes: `Broadcasts` (задача 5), `isBroadcastable`, `parseButton`, `reportText`, `progressText`, `AdminInput`.

Тексты: раздел без рассылок — «Рассылок ещё не было», `[Новая рассылка]`, `[‹ Назад]`; после рассылки — `'Последняя рассылка ДД.ММ.ГГГГ\n' + reportText(s)`; идёт — `progressText` и `[Остановить]`. Шаги — по 9.5: «Пришлите сообщение для рассылки»; отказ — «Пришлите одно сообщение: текст, фото, видео, GIF, файл, аудио или голосовое»; «Добавить кнопку?» `[Добавить кнопку] [Без кнопки]`; «Пришлите кнопку в виде: Название | https://адрес»; неверно — «Не получилось. Формат: Название | https://адрес, название до 64 символов»; предпросмотр — `copyMessage` админу с кнопкой, затем «Получателей: N» `[Отправить] [Отмена]`; занято — «Уже идёт рассылка. Дождитесь окончания или остановите её»; остановка законченной — ответ на нажатие «Рассылка уже закончилась».

- [ ] **Шаг 1: Падающие тесты**
  - путь целиком: `adm:bc` → `adm:bc:new` → фото от админа (message_id 50) → «Добавить кнопку?» → `adm:bc:btn` → `'Каталог | https://x.ru'` → `copyMessage` админу (`from_chat_id 1`, `message_id 50`, url-кнопка «Каталог») и «Получателей: 1180» → `adm:bc:send` → `broadcasts.start({ adminId: 1, sourceChatId: 1, sourceMessageId: 50, button: { text: 'Каталог', url: 'https://x.ru' } })`.
  - стикер и часть альбома → текст отказа, `start` не вызывается, следующий текст принимается.
  - `adm:bc:nobtn` → предпросмотр без `reply_markup`.
  - `start` вернул `running` → «Уже идёт рассылка…».
  - `adm:bc:send` / `adm:bc:btn` / `adm:bc:nobtn` без черновика → «Кнопка устарела, нажмите /start», `start` не вызывается.
  - `adm:bc:cancel` очищает черновик и показывает меню админки.
  - `adm:bc:stop:7` → `stop(1, 7)`; `false` → «Рассылка уже закончилась».

- [ ] **Шаг 2: `pnpm test` — падают**
- [ ] **Шаг 3: Реализация**
- [ ] **Шаг 4: `pnpm test` — проходят**
- [ ] **Шаг 5: Коммит** `feat: admin broadcast section`

---

### Задача 12: Сборка в `main` и проверка

**Файлы:**
- Изменить: `src/main.ts`
- Тест: существующий `test/unit/main.test.ts` (не должен сломаться)

- [ ] **Шаг 1: Подключение.** В `main`: `createAdminServices(prisma)`, `createBroadcasts({ store: createBroadcastStore(prisma), api: () => bot.api, clock, logger })`, передать в `createBot` как `admin` и `broadcasts`. После `bot.init()` вызвать `void broadcasts.resume()`. При остановке до `prisma.$disconnect()` — `runner.stop()`, затем `broadcasts.idle()` не ждать дольше 10 секунд (рассылка останется `RUNNING` и продолжится). `allowed_updates` уже содержит `my_chat_member`.

- [ ] **Шаг 2: Полная проверка**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build`
Expected: всё зелёное, вывод показать владельцу.

- [ ] **Шаг 3: Ручная проверка на тестовом боте** (перезапустить фоновый процесс бота новой сборкой): `/admin`, «База», смена цены и скрытие тарифа (покупатель видит изменения в «Купить подписку»), поиск себя, «Добавить дни» 1, «Завершить подписку», рассылка с фото и кнопкой на себя, «Остановить».

- [ ] **Шаг 4: Коммит** `feat: wire admin and broadcasts into main`
