-- Reduce scan cost for public page lists, category pages, and click analytics.
CREATE INDEX "Page_status_publishedAt_updatedAt_idx" ON "Page"("status", "publishedAt", "updatedAt");
CREATE INDEX "Page_productId_idx" ON "Page"("productId");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Offer_productId_updatedAt_idx" ON "Offer"("productId", "updatedAt");
CREATE INDEX "ClickEvent_pageId_createdAt_idx" ON "ClickEvent"("pageId", "createdAt");
CREATE INDEX "ClickEvent_offerId_createdAt_idx" ON "ClickEvent"("offerId", "createdAt");
CREATE INDEX "ClickEvent_source_createdAt_idx" ON "ClickEvent"("source", "createdAt");
