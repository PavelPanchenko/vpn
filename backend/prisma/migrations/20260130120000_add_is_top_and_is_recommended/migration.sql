-- Plan: подсветка «Топ тариф» в Mini App (задаётся в админке)
ALTER TABLE "plans" ADD COLUMN "isTop" BOOLEAN NOT NULL DEFAULT false;

-- VpnServer: подсветка «Рекомендуем» в Mini App; по умолчанию можно показывать локацию с большим свободным местом
ALTER TABLE "vpn_servers" ADD COLUMN "isRecommended" BOOLEAN NOT NULL DEFAULT false;
