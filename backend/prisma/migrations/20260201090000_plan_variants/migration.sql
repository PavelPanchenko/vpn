-- 1) Create plan_variants (retry-safe)
CREATE TABLE IF NOT EXISTS "plan_variants" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_variants_code_key" ON "plan_variants"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "plan_variants_planId_currency_key" ON "plan_variants"("planId", "currency");
CREATE INDEX IF NOT EXISTS "plan_variants_planId_idx" ON "plan_variants"("planId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_variants_planId_fkey') THEN
    ALTER TABLE "plan_variants"
      ADD CONSTRAINT "plan_variants_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Build mapping table old_plan_id -> canonical_plan_id (retry-safe)
DROP TABLE IF EXISTS plan_merge_map;
CREATE TEMP TABLE plan_merge_map AS
WITH ranked AS (
  SELECT
    p.*,
    ROW_NUMBER() OVER (
      PARTITION BY p."name", p."periodDays", p."isTrial"
      ORDER BY (CASE WHEN p."currency" = 'XTR' THEN 1 ELSE 0 END) ASC, p."createdAt" ASC
    ) AS rn
  FROM "plans" p
),
canonical AS (
  SELECT id, "name", "periodDays", "isTrial"
  FROM ranked
  WHERE rn = 1
)
SELECT
  p.id AS old_plan_id,
  c.id AS canonical_plan_id
FROM "plans" p
JOIN canonical c
  ON c."name" = p."name"
 AND c."periodDays" = p."periodDays"
 AND c."isTrial" = p."isTrial";

-- 3) Insert old plans as variants under canonical plan (id варианта == old plan id)
INSERT INTO "plan_variants" ("id", "planId", "code", "currency", "price", "provider", "active", "createdAt")
SELECT
  p.id,
  m.canonical_plan_id,
  p."code",
  p."currency",
  p."price",
  CASE WHEN p."currency" = 'XTR' THEN 'TELEGRAM_STARS' ELSE 'EXTERNAL_URL' END,
  p."active",
  p."createdAt"
FROM "plans" p
JOIN plan_merge_map m ON m.old_plan_id = p.id
ON CONFLICT ("id") DO NOTHING;

-- 4) Move payments.planId to canonical planId (so payments still link to tariff group)
UPDATE "payments" pay
SET "planId" = m.canonical_plan_id
FROM plan_merge_map m
WHERE pay."planId" = m.old_plan_id;

-- 5) Merge flags into canonical plan (best-effort)
-- active = OR, legacy = OR, isTop = OR, availableFor = ALL if mixed, description = first non-empty.
WITH agg AS (
  SELECT
    m.canonical_plan_id,
    BOOL_OR(p."active") AS any_active,
    BOOL_OR(p."legacy") AS any_legacy,
    BOOL_OR(p."isTop") AS any_top,
    CASE
      WHEN COUNT(DISTINCT p."availableFor") > 1 THEN 'ALL'
      ELSE MAX(p."availableFor")
    END AS merged_available_for,
    MAX(NULLIF(p."description", '')) AS merged_description
  FROM "plans" p
  JOIN plan_merge_map m ON m.old_plan_id = p.id
  GROUP BY m.canonical_plan_id
)
UPDATE "plans" p
SET
  "active" = a.any_active,
  "legacy" = a.any_legacy,
  "isTop" = a.any_top,
  "availableFor" = a.merged_available_for,
  "description" = COALESCE(NULLIF(p."description", ''), a.merged_description)
FROM agg a
WHERE p.id = a.canonical_plan_id;

-- 6) Delete duplicate plans (keep only canonical)
DELETE FROM "plans" p
USING plan_merge_map m
WHERE p.id = m.old_plan_id
  AND m.old_plan_id <> m.canonical_plan_id;

-- 7) Drop old columns price/currency from plans (data now lives in plan_variants) (retry-safe)
ALTER TABLE "plans" DROP COLUMN IF EXISTS "price";
ALTER TABLE "plans" DROP COLUMN IF EXISTS "currency";

