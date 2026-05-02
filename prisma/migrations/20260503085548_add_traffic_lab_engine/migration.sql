-- AlterTable
ALTER TABLE "ClickEvent" ADD COLUMN     "country" TEXT,
ADD COLUMN     "ctaVariantId" TEXT,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "funnelId" TEXT,
ADD COLUMN     "nicheSlug" TEXT,
ADD COLUMN     "outboundUrl" TEXT,
ADD COLUMN     "pagePath" TEXT,
ADD COLUMN     "placementId" TEXT,
ADD COLUMN     "referrerUrl" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "trafficOfferId" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "TrafficNiche" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "primaryMonetization" TEXT NOT NULL DEFAULT 'mixed',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "targetGeography" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficNiche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficFunnel" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "entryPageId" TEXT,
    "deepPageIds" JSONB,
    "quizPageId" TEXT,
    "comparisonPageIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetCpc" DECIMAL(12,4),
    "targetRpm" DECIMAL(12,4),
    "targetEpv" DECIMAL(12,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficOffer" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT,
    "existingOfferId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "offerType" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "network" TEXT,
    "commissionType" TEXT,
    "estimatedEpc" DECIMAL(12,4),
    "geo" TEXT,
    "device" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "disclosureRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficPlacement" (
    "id" TEXT NOT NULL,
    "pageId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "placementType" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "maxImpressionsPerSession" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficPlacementOnOffer" (
    "placementId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,

    CONSTRAINT "TrafficPlacementOnOffer_pkey" PRIMARY KEY ("placementId","offerId")
);

-- CreateTable
CREATE TABLE "TrafficCtaVariant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "ctaSubtext" TEXT,
    "buttonText" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficCtaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpressionEvent" (
    "id" TEXT NOT NULL,
    "pageId" TEXT,
    "trafficOfferId" TEXT,
    "placementId" TEXT,
    "ctaVariantId" TEXT,
    "sessionId" TEXT,
    "pagePath" TEXT,
    "nicheSlug" TEXT,
    "viewportSeen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpressionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficCampaignCost" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "utmCampaign" TEXT,
    "spend" DECIMAL(12,2) NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cpc" DECIMAL(12,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficCampaignCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficRevenueImport" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "pagePath" TEXT,
    "revenue" DECIMAL(12,2) NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "rpm" DECIMAL(12,4),
    "epc" DECIMAL(12,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficRevenueImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficNiche_slug_key" ON "TrafficNiche"("slug");

-- CreateIndex
CREATE INDEX "TrafficNiche_status_updatedAt_idx" ON "TrafficNiche"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficFunnel_slug_key" ON "TrafficFunnel"("slug");

-- CreateIndex
CREATE INDEX "TrafficFunnel_nicheId_status_updatedAt_idx" ON "TrafficFunnel"("nicheId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficOffer_slug_key" ON "TrafficOffer"("slug");

-- CreateIndex
CREATE INDEX "TrafficOffer_nicheId_status_updatedAt_idx" ON "TrafficOffer"("nicheId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TrafficOffer_existingOfferId_idx" ON "TrafficOffer"("existingOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficPlacement_slug_key" ON "TrafficPlacement"("slug");

-- CreateIndex
CREATE INDEX "TrafficPlacement_pageId_status_updatedAt_idx" ON "TrafficPlacement"("pageId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficCtaVariant_slug_key" ON "TrafficCtaVariant"("slug");

-- CreateIndex
CREATE INDEX "TrafficCtaVariant_status_updatedAt_idx" ON "TrafficCtaVariant"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ImpressionEvent_createdAt_idx" ON "ImpressionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ImpressionEvent_pageId_createdAt_idx" ON "ImpressionEvent"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "ImpressionEvent_trafficOfferId_createdAt_idx" ON "ImpressionEvent"("trafficOfferId", "createdAt");

-- CreateIndex
CREATE INDEX "ImpressionEvent_placementId_createdAt_idx" ON "ImpressionEvent"("placementId", "createdAt");

-- CreateIndex
CREATE INDEX "ImpressionEvent_ctaVariantId_createdAt_idx" ON "ImpressionEvent"("ctaVariantId", "createdAt");

-- CreateIndex
CREATE INDEX "TrafficCampaignCost_date_source_idx" ON "TrafficCampaignCost"("date", "source");

-- CreateIndex
CREATE INDEX "TrafficCampaignCost_utmCampaign_idx" ON "TrafficCampaignCost"("utmCampaign");

-- CreateIndex
CREATE INDEX "TrafficRevenueImport_date_source_idx" ON "TrafficRevenueImport"("date", "source");

-- CreateIndex
CREATE INDEX "TrafficRevenueImport_pagePath_idx" ON "TrafficRevenueImport"("pagePath");

-- CreateIndex
CREATE INDEX "ClickEvent_trafficOfferId_createdAt_idx" ON "ClickEvent"("trafficOfferId", "createdAt");

-- CreateIndex
CREATE INDEX "ClickEvent_funnelId_createdAt_idx" ON "ClickEvent"("funnelId", "createdAt");

-- CreateIndex
CREATE INDEX "ClickEvent_placementId_createdAt_idx" ON "ClickEvent"("placementId", "createdAt");

-- CreateIndex
CREATE INDEX "ClickEvent_utmCampaign_createdAt_idx" ON "ClickEvent"("utmCampaign", "createdAt");

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_trafficOfferId_fkey" FOREIGN KEY ("trafficOfferId") REFERENCES "TrafficOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "TrafficFunnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TrafficPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_ctaVariantId_fkey" FOREIGN KEY ("ctaVariantId") REFERENCES "TrafficCtaVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficFunnel" ADD CONSTRAINT "TrafficFunnel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "TrafficNiche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficOffer" ADD CONSTRAINT "TrafficOffer_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "TrafficNiche"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficOffer" ADD CONSTRAINT "TrafficOffer_existingOfferId_fkey" FOREIGN KEY ("existingOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficPlacement" ADD CONSTRAINT "TrafficPlacement_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficPlacementOnOffer" ADD CONSTRAINT "TrafficPlacementOnOffer_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TrafficPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficPlacementOnOffer" ADD CONSTRAINT "TrafficPlacementOnOffer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "TrafficOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpressionEvent" ADD CONSTRAINT "ImpressionEvent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpressionEvent" ADD CONSTRAINT "ImpressionEvent_trafficOfferId_fkey" FOREIGN KEY ("trafficOfferId") REFERENCES "TrafficOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpressionEvent" ADD CONSTRAINT "ImpressionEvent_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TrafficPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpressionEvent" ADD CONSTRAINT "ImpressionEvent_ctaVariantId_fkey" FOREIGN KEY ("ctaVariantId") REFERENCES "TrafficCtaVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficCampaignCost" ADD CONSTRAINT "TrafficCampaignCost_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "TrafficNiche"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficRevenueImport" ADD CONSTRAINT "TrafficRevenueImport_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "TrafficNiche"("id") ON DELETE SET NULL ON UPDATE CASCADE;
