# xstorexbot

Telegram-бот подписок. Дизайн: `docs/superpowers/specs/2026-11-06-xstorexbot-design.md`.

## Первая настройка

1. `cp .env.example .env` и заполните значения.
2. `pnpm install`
3. `pnpm db:up` (PostgreSQL на `127.0.0.1:5433`)
4. `pnpm db:migrate`
5. Скопируйте `content.example/` в `content/` и поправьте тексты.
6. `pnpm dev`

## Проверки

```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:int
```
