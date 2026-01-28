-- Add useMiniApp flag to bot configuration
ALTER TABLE "bot_config"
ADD COLUMN "useMiniApp" BOOLEAN NOT NULL DEFAULT false;

