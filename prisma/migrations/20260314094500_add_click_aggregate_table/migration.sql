CREATE TABLE "ClickAggregate" (
    "bucketKey" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "pageId" TEXT,
    "offerId" TEXT,
    "source" "OfferSource" NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickAggregate_pkey" PRIMARY KEY ("bucketKey")
);

INSERT INTO "ClickAggregate" ("bucketKey", "day", "pageId", "offerId", "source", "clicks", "createdAt", "updatedAt")
SELECT
    CONCAT(
      TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD'),
      ':',
      "source"::text,
      ':',
      COALESCE("pageId", '-'),
      ':',
      COALESCE("offerId", '-')
    ) AS "bucketKey",
    DATE_TRUNC('day', "createdAt") AS "day",
    "pageId",
    "offerId",
    "source",
    COUNT(*)::int AS "clicks",
    MIN("createdAt") AS "createdAt",
    MAX("createdAt") AS "updatedAt"
FROM "ClickEvent"
GROUP BY 1, 2, 3, 4, 5;

CREATE INDEX "ClickAggregate_day_idx" ON "ClickAggregate"("day");
CREATE INDEX "ClickAggregate_pageId_day_idx" ON "ClickAggregate"("pageId", "day");
CREATE INDEX "ClickAggregate_offerId_day_idx" ON "ClickAggregate"("offerId", "day");
CREATE INDEX "ClickAggregate_source_day_idx" ON "ClickAggregate"("source", "day");

ALTER TABLE "ClickAggregate" ADD CONSTRAINT "ClickAggregate_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickAggregate" ADD CONSTRAINT "ClickAggregate_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
