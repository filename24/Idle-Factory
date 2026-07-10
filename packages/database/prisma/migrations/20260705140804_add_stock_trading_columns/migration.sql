-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "dividendRatePpm" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "StockHolding" ADD COLUMN     "avgBuyPrice" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TradeLog" ADD COLUMN     "stockId" TEXT;

-- CreateTable
CREATE TABLE "StockDividend" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "totalPaid" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockProfitLog" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockProfitLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockDividend_stockId_weekStart_key" ON "StockDividend"("stockId", "weekStart");

-- CreateIndex
CREATE INDEX "StockProfitLog_stockId_createdAt_idx" ON "StockProfitLog"("stockId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLog_stockId_kind_createdAt_idx" ON "TradeLog"("stockId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "StockDividend" ADD CONSTRAINT "StockDividend_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockProfitLog" ADD CONSTRAINT "StockProfitLog_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLog" ADD CONSTRAINT "TradeLog_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
