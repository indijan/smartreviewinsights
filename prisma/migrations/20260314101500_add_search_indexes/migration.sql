-- Speed up search/category lookups without changing user-facing behavior.
CREATE INDEX "PageTag_tagId_pageId_idx" ON "PageTag"("tagId", "pageId");

CREATE INDEX "Page_search_tsv_idx"
ON "Page"
USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(excerpt, '')));

CREATE INDEX "Product_search_tsv_idx"
ON "Product"
USING GIN (to_tsvector('simple', coalesce("canonicalName", '') || ' ' || coalesce(category, '')));

CREATE INDEX "Product_category_prefix_idx"
ON "Product" (category text_pattern_ops);
