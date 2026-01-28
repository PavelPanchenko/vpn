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

## Доступ

- API по умолчанию: `http://localhost:3000`
- Frontend по умолчанию: `http://localhost:5173`

## Основные возможности

- Admin login (JWT)
- CRUD: VPN Servers / VPN Users / Subscriptions / Payments
- Авто-обновление статуса пользователя в `EXPIRED` при истечении активной подписки (по запросу/операциям)

