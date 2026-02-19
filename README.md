# VLESS VPN Admin Panel (MVP)

Монорепозиторий:

- `backend/` — NestJS + Prisma + PostgreSQL (REST, JWT auth)
- `frontend/` — React + Vite (admin dashboard)

## Быстрый старт

### 1) Backend

1. Скопируйте `backend/.env.example` в `backend/.env` и заполните значения.
2. Установите зависимости:

```bash
npm install
```

3. Примените миграции и сгенерируйте Prisma Client:

```bash
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:migrate
```

4. Запустите API:

```bash
npm --workspace backend run start:dev
```

### 2) Frontend

1. Скопируйте `frontend/.env.example` в `frontend/.env`.
2. Запустите dev-сервер:

```bash
npm --workspace frontend run dev
```

### 3) Запуск через Docker

Backend и PostgreSQL в одном стеке, консоль не засоряется лишними логами:

```bash
docker compose up -d
```

- БД: образ `postgres:16`, в консоль пишутся только предупреждения и ошибки (без checkpoint и т.п.).
- Backend: в консоль по умолчанию только `warn` и `error`; полные логи доступны в админке на странице «Логи».

## Доступ

- API по умолчанию: `http://localhost:3000`
- Frontend по умолчанию: `http://localhost:5173`

## Основные возможности

- Admin login (JWT)
- CRUD: VPN Servers / VPN Users / Subscriptions / Payments
- Страница **Логи** в админке — буфер логов приложения (уровни log, warn, error по умолчанию)
- Авто-обновление статуса пользователя в `EXPIRED` при истечении активной подписки (по запросу/операциям)

## Логирование

- **Консоль (сервер):** какие уровни выводить задаётся переменной `LOG_LEVEL_CONSOLE` (по умолчанию `warn,error`). В Docker для backend в `docker-compose.yml` уже задано `LOG_LEVEL_CONSOLE=warn,error`.
- **Буфер для админки (страница «Логи»):** уровни задаются `LOG_LEVEL_BUFFER` (по умолчанию `log,warn,error`; без `debug` и `verbose`). При необходимости можно добавить, например: `LOG_LEVEL_BUFFER=debug,log,warn,error`.

