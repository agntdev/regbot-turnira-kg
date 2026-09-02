# Кибертурнир Кыргызстан — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Бот для регистрации команд и управления турниром по киберспорту в Кыргызстане. Позволяет капитанам регистрировать команды, админам управлять заявками и турнирной таблицей, а зрителям просматривать список команд и брэкет.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Капитаны команд
- Админы-организаторы
- Публичные зрители

## Success criteria

- Капитаны могут зарегистрировать команды с минимальными данными
- Админы получают уведомления о новых заявках и конфликтах
- Публичный доступ к списку команд и турнирной таблице

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Открыть главное меню
- **Регистрация команды** (button, actor: user, callback: registration:start) — Начать регистрацию новой команды
  - inputs: название команды, данные капитана, данные игроков
  - outputs: подтверждение регистрации, уведомление админам
- **Просмотр команд** (button, actor: user, callback: view:teams) — Просмотреть список всех команд
  - outputs: список команд
- **Турнирная таблица** (button, actor: user, callback: view:bracket) — Посмотреть брэкет и список матчей
  - outputs: турнирная таблица

## Flows

### Регистрация команды
_Trigger:_ registration:start

1. Пользователь нажимает 'Регистрация команды'
2. Запрашивает название команды
3. Сбор данных капитана
4. Сбор данных игроков
5. Предпросмотр заявки
6. Подтверждение отправки
7. Проверка на конфликты ID
8. Уведомление админов

_Data touched:_ заявка, капитан, игроки

### Админская панель
_Trigger:_ admin:panel

1. Админ получает уведомление
2. Открывает панель управления
3. Принимает/отклоняет заявки
4. Редактирует результаты матчей
5. Добавляет ссылки на бои

_Data touched:_ заявка, турнирная таблица

### Публичный просмотр
_Trigger:_ view:teams

1. Пользователь нажимает 'Просмотр команд'
2. Отображает список команд
3. Пользователь нажимает 'Турнирная таблица'
4. Отображает брэкет и список матчей

_Data touched:_ заявка, турнирная таблица

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — куда приходят уведомления о новых заявках и конфликтах (один или несколько Telegram ID)
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **заявка** _(retention: persistent)_ — Данные команды, включая название, капитана и игроков
  - fields: название, капитан, игроки
- **капитан** _(retention: persistent)_ — Данные капитана команды
  - fields: игровой ID, никнейм, Telegram @username, телефон
- **игрок** _(retention: persistent)_ — Данные игрока команды
  - fields: игровой ID, никнейм
- **турнирная таблица** _(retention: persistent)_ — Структура турнира и результаты матчей
  - fields: брэкет, список матчей, ссылки на бои

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- ADMIN_CHAT_ID

## Notifications

- Уведомления о новых заявках
- Уведомления о конфликтах ID/дубликатах
- Уведомления админам о решении конфликтов

## Permissions & privacy

- Доступ к списку команд и турнирной таблице ограничен только для просмотра
- Данные капитанов и игроков не передаются третьим лицам

## Edge cases

- Конфликты игровых ID
- Дублирующиеся заявки от одного капитана
- Ошибки в данных при регистрации
- Изменения в заявке после подтверждения

## Required tests

- Проверка регистрации команды с минимальными данными
- Проверка уведомлений админам при конфликтах
- Проверка публичного просмотра списка команд и турнирной таблицы

## Assumptions

- Админы будут своевременно обрабатывать заявки и решать конфликты
- Капитаны будут корректно заполнять данные при регистрации
- Зрители будут использовать публичные функции для просмотра информации
