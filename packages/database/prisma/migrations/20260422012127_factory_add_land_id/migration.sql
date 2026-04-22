-- Phase 2 step 4a: add Factory.landId (FK to Land) + index.
-- Backfills from Slot.landId for existing factories (any one slot is authoritative;
-- all slots of a factory share the same land). Orphan factories (no slots) are
-- deleted — should not exist under invariants, guarded here for safety.

-- 1. Nullable column.
ALTER TABLE "Factory" ADD COLUMN "landId" TEXT;

-- 2. Backfill from any slot owned by each factory.
UPDATE "Factory" f
SET "landId" = (
  SELECT s."landId"
  FROM "Slot" s
  WHERE s."factoryId" = f.id
  LIMIT 1
);

-- 3. Safety: drop orphan factories that never had slots.
DELETE FROM "Factory" WHERE "landId" IS NULL;

-- 4. Enforce NOT NULL + FK + index.
ALTER TABLE "Factory" ALTER COLUMN "landId" SET NOT NULL;
ALTER TABLE "Factory"
  ADD CONSTRAINT "Factory_landId_fkey"
  FOREIGN KEY ("landId") REFERENCES "Land"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Factory_landId_idx" ON "Factory"("landId");
