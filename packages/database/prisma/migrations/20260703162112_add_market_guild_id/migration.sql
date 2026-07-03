-- AlterTable
ALTER TABLE "MarketListing" ADD COLUMN     "guildId" TEXT;

-- AlterTable
ALTER TABLE "TradeLog" ADD COLUMN     "guildId" TEXT;

-- CreateIndex
CREATE INDEX "TradeLog_guildId_createdAt_idx" ON "TradeLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLog_fromUserId_toUserId_kind_createdAt_idx" ON "TradeLog"("fromUserId", "toUserId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "TradeLog" ADD CONSTRAINT "TradeLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
