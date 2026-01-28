FROM node:20-alpine AS builder

WORKDIR /app

# Устанавливаем зависимости (dev-зависимости тоже нужны для сборки и prisma)
COPY package*.json ./
RUN npm install

# Копируем схему Prisma и генерируем клиент
COPY prisma ./prisma
RUN npm run prisma:generate

# Копируем исходники и собираем приложение
COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Копируем собранное приложение и зависимости из builder-слоя
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Запускаем миграции Prisma перед стартом приложения
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

