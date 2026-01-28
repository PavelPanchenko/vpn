FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Библиотеки + build-tools (bcrypt / prisma engines)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Делаем npm более устойчивым к сетевым обрывам (Prisma engines часто качаются в postinstall)
ENV npm_config_loglevel=warn \
  npm_config_fund=false \
  npm_config_audit=false \
  npm_config_fetch_retries=5 \
  npm_config_fetch_retry_mintimeout=20000 \
  npm_config_fetch_retry_maxtimeout=120000

# Устанавливаем зависимости (dev-зависимости тоже нужны для сборки и prisma)
COPY package*.json ./
RUN npm install

# Копируем схему Prisma и генерируем клиент
COPY prisma ./prisma
RUN npm run prisma:generate

# Копируем исходники и собираем приложение
COPY . .
RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Рантайм-зависимости для Prisma migrate
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Копируем собранное приложение и зависимости из builder-слоя
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Запускаем миграции Prisma перед стартом приложения
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

