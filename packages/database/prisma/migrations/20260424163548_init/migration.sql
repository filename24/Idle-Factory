-- CreateEnum
CREATE TYPE "FactoryType" AS ENUM ('FARM', 'MINE', 'LUMBER', 'OIL_WELL', 'STEEL_MILL', 'REFINERY', 'FLOUR_MILL', 'FURNITURE_FACTORY', 'CAR_FACTORY', 'ELECTRONICS_FACTORY', 'FOOD_FACTORY');

-- CreateEnum
CREATE TYPE "FactoryTier" AS ENUM ('T1', 'T2', 'T3');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('GRAIN', 'ORE', 'WOOD', 'CRUDE_OIL', 'STEEL', 'FUEL', 'PLASTIC', 'PROCESSED_FOOD', 'FURNITURE', 'CAR', 'ELECTRONIC', 'FINISHED_FOOD', 'RAW_BOOSTER');

-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('NORMAL', 'ORE', 'FERTILE', 'FOREST', 'OIL', 'WATER');

-- CreateEnum
CREATE TYPE "UpgradeBooster" AS ENUM ('SAVING', 'RARE', 'SPEED', 'PROFIT');

-- CreateEnum
CREATE TYPE "ShortageMode" AS ENUM ('PAUSE', 'AUTO_BUY', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StockMarket" AS ENUM ('SERVER', 'GLOBAL');

-- CreateEnum
CREATE TYPE "TradeKind" AS ENUM ('MARKET_SELL', 'USER_TRADE', 'DIRECT_BUY', 'STOCK_BUY', 'STOCK_SELL', 'DIVIDEND');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nickname" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'ko',
    "money" BIGINT NOT NULL DEFAULT 0,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "flag" BIGINT NOT NULL DEFAULT 1,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyBought" INTEGER NOT NULL DEFAULT 0,
    "dailyBoughtResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ko',
    "credit" INTEGER NOT NULL DEFAULT 1000,
    "vault" BIGINT NOT NULL DEFAULT 0,
    "weeklyDAU" INTEGER NOT NULL DEFAULT 0,
    "taxSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flag" BIGINT NOT NULL DEFAULT 1,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Land" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER NOT NULL DEFAULT 4,
    "height" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "Land_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "landId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "type" "SlotType" NOT NULL DEFAULT 'NORMAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "factoryId" TEXT,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "landId" TEXT NOT NULL,
    "guildId" TEXT,
    "type" "FactoryType" NOT NULL,
    "tier" "FactoryTier" NOT NULL,
    "grade" INTEGER NOT NULL DEFAULT 1,
    "exp" BIGINT NOT NULL DEFAULT 0,
    "anchorX" INTEGER NOT NULL,
    "anchorY" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1,
    "height" INTEGER NOT NULL DEFAULT 1,
    "lastHarvestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shortageMode" "ShortageMode" NOT NULL DEFAULT 'PAUSE',
    "upgradeBooster" "UpgradeBooster",
    "hasRawBooster" BOOLEAN NOT NULL DEFAULT false,
    "flag" BIGINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT,
    "name" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "exp" BIGINT NOT NULL DEFAULT 0,
    "athletics" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "machinery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flag" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseStack" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "material" "MaterialType" NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "WarehouseStack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalMarketPrice" (
    "material" "MaterialType" NOT NULL,
    "basePrice" BIGINT NOT NULL,
    "currentPrice" BIGINT NOT NULL,
    "recentSales" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalMarketPrice_pkey" PRIMARY KEY ("material")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "material" "MaterialType" NOT NULL,
    "price" BIGINT NOT NULL,
    "qty" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalBought" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "market" "StockMarket" NOT NULL,
    "guildId" TEXT,
    "ipoPrice" BIGINT NOT NULL,
    "currentPrice" BIGINT NOT NULL,
    "sharesOutstanding" INTEGER NOT NULL DEFAULT 100,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weeklyProfit" BIGINT NOT NULL DEFAULT 0,
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "shares" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPriceTick" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "tickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPriceTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLog" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "kind" "TradeKind" NOT NULL,
    "material" "MaterialType",
    "amount" BIGINT NOT NULL DEFAULT 0,
    "price" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "salesRevenue" BIGINT NOT NULL DEFAULT 0,
    "taxPaid" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InactiveServerPool" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "frozenAmount" BIGINT NOT NULL DEFAULT 0,
    "exitedAt" TIMESTAMP(3) NOT NULL,
    "distributedAt" TIMESTAMP(3),

    CONSTRAINT "InactiveServerPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Land_userId_idx" ON "Land"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Land_userId_index_key" ON "Land"("userId", "index");

-- CreateIndex
CREATE INDEX "Slot_factoryId_idx" ON "Slot"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_landId_x_y_key" ON "Slot"("landId", "x", "y");

-- CreateIndex
CREATE INDEX "Factory_userId_idx" ON "Factory"("userId");

-- CreateIndex
CREATE INDEX "Factory_landId_idx" ON "Factory"("landId");

-- CreateIndex
CREATE INDEX "Factory_guildId_idx" ON "Factory"("guildId");

-- CreateIndex
CREATE INDEX "Worker_factoryId_idx" ON "Worker"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_userId_key" ON "Warehouse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseStack_warehouseId_material_key" ON "WarehouseStack"("warehouseId", "material");

-- CreateIndex
CREATE INDEX "MarketListing_sellerId_idx" ON "MarketListing"("sellerId");

-- CreateIndex
CREATE INDEX "MarketListing_material_status_idx" ON "MarketListing"("material", "status");

-- CreateIndex
CREATE INDEX "MarketListing_expiresAt_idx" ON "MarketListing"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPurchase_userId_date_key" ON "DailyPurchase"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_factoryId_key" ON "Stock"("factoryId");

-- CreateIndex
CREATE INDEX "Stock_market_idx" ON "Stock"("market");

-- CreateIndex
CREATE INDEX "Stock_guildId_idx" ON "Stock"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "StockHolding_userId_stockId_key" ON "StockHolding"("userId", "stockId");

-- CreateIndex
CREATE INDEX "StockPriceTick_stockId_tickAt_idx" ON "StockPriceTick"("stockId", "tickAt");

-- CreateIndex
CREATE INDEX "TradeLog_fromUserId_createdAt_idx" ON "TradeLog"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLog_toUserId_createdAt_idx" ON "TradeLog"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLog_kind_createdAt_idx" ON "TradeLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklySettlement_guildId_weekStart_idx" ON "WeeklySettlement"("guildId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySettlement_userId_weekStart_key" ON "WeeklySettlement"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "InactiveServerPool_guildId_key" ON "InactiveServerPool"("guildId");

-- CreateIndex
CREATE INDEX "Notice_title_idx" ON "Notice"("title");

-- CreateIndex
CREATE INDEX "Notice_postedAt_idx" ON "Notice"("postedAt");

-- AddForeignKey
ALTER TABLE "Land" ADD CONSTRAINT "Land_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_landId_fkey" FOREIGN KEY ("landId") REFERENCES "Land"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_landId_fkey" FOREIGN KEY ("landId") REFERENCES "Land"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseStack" ADD CONSTRAINT "WarehouseStack_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPurchase" ADD CONSTRAINT "DailyPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPriceTick" ADD CONSTRAINT "StockPriceTick_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLog" ADD CONSTRAINT "TradeLog_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLog" ADD CONSTRAINT "TradeLog_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySettlement" ADD CONSTRAINT "WeeklySettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySettlement" ADD CONSTRAINT "WeeklySettlement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InactiveServerPool" ADD CONSTRAINT "InactiveServerPool_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
