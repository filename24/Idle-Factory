-- DropForeignKey
ALTER TABLE "WeeklySettlement" DROP CONSTRAINT "WeeklySettlement_guildId_fkey";

-- AlterTable
ALTER TABLE "WeeklySettlement" ADD COLUMN     "baseTaxBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxDue" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalAssets" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unpaidAmount" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "guildId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WeeklySettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "guildId" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "salesRevenue" BIGINT NOT NULL DEFAULT 0,
    "taxDue" BIGINT NOT NULL DEFAULT 0,
    "taxPaid" BIGINT NOT NULL DEFAULT 0,
    "appliedBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeeklySettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildDailyActivity" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildDailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklySettlement_weekStart_idx" ON "WeeklySettlement"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklySettlementLine_settlementId_idx" ON "WeeklySettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "WeeklySettlementLine_guildId_weekStart_idx" ON "WeeklySettlementLine"("guildId", "weekStart");

-- CreateIndex
CREATE INDEX "GuildDailyActivity_guildId_date_idx" ON "GuildDailyActivity"("guildId", "date");

-- CreateIndex
CREATE INDEX "GuildDailyActivity_date_idx" ON "GuildDailyActivity"("date");

-- CreateIndex
CREATE UNIQUE INDEX "GuildDailyActivity_guildId_userId_date_key" ON "GuildDailyActivity"("guildId", "userId", "date");

-- AddForeignKey
ALTER TABLE "WeeklySettlement" ADD CONSTRAINT "WeeklySettlement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySettlementLine" ADD CONSTRAINT "WeeklySettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "WeeklySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySettlementLine" ADD CONSTRAINT "WeeklySettlementLine_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
