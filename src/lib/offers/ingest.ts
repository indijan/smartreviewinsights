import { OfferSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OfferIngestItem = {
  source: OfferSource;
  externalId: string;
  productId?: string;
  title?: string;
  price?: number | null;
  currency?: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  availability?: string | null;
  productName: string;
  productCategory?: string | null;
  pageSlug?: string | null;
  partnerName?: string | null;
  payload?: unknown;
};

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return new Prisma.Decimal(value);
}

export async function ingestOfferItems(items: OfferIngestItem[]) {
  let createdOffers = 0;
  let updatedOffers = 0;
  let priceUpdates = 0;

  for (const item of items) {
    const partner = item.partnerName
      ? await prisma.partner.findFirst({
          where: {
            source: item.source,
            name: item.partnerName,
          },
          select: { id: true },
        })
      : await prisma.partner.findFirst({
          where: { source: item.source },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

    const page = item.pageSlug
      ? await prisma.page.findUnique({
          where: { slug: item.pageSlug },
          select: { id: true, productId: true, product: { select: { category: true } } },
        })
      : null;

    const existingProduct = await prisma.product.findFirst({
      where: {
        canonicalName: item.productName,
        category: item.productCategory || "unassigned",
      },
      select: { id: true },
    });

    const canReusePageProduct =
      Boolean(page?.productId) && (!item.productCategory || page?.product?.category === item.productCategory);

    const productId =
      item.productId ??
      (canReusePageProduct ? page?.productId : null) ??
      existingProduct?.id ??
      (
        await prisma.product.create({
          data: {
            canonicalName: item.productName,
            category: item.productCategory || "unassigned",
          },
          select: { id: true },
        })
      ).id;

    if (page && !page.productId) {
      await prisma.page.update({
        where: { id: page.id },
        data: { productId },
      });
    }

    const currentPrice = toDecimal(item.price);

    const existing = await prisma.offer.findUnique({
      where: {
        source_externalId: {
          source: item.source,
          externalId: item.externalId,
        },
      },
      select: {
        id: true,
        price: true,
        currency: true,
      },
    });

    const offer = existing
      ? await prisma.offer.update({
          where: { id: existing.id },
          data: {
            productId,
            partnerId: partner?.id ?? null,
            title: item.title ?? null,
            price: currentPrice,
            currency: item.currency || "USD",
            availability: item.availability ?? null,
            affiliateUrl: item.affiliateUrl,
            imageUrl: item.imageUrl ?? null,
            lastUpdated: new Date(),
          },
          select: { id: true },
        })
      : await prisma.offer.create({
          data: {
            source: item.source,
            externalId: item.externalId,
            productId,
            partnerId: partner?.id ?? null,
            title: item.title ?? null,
            price: currentPrice,
            currency: item.currency || "USD",
            availability: item.availability ?? null,
            affiliateUrl: item.affiliateUrl,
            imageUrl: item.imageUrl ?? null,
            lastUpdated: new Date(),
          },
          select: { id: true },
        });

    if (existing) {
      updatedOffers += 1;
    } else {
      createdOffers += 1;
    }

    const shouldWritePriceHistory =
      currentPrice !== null &&
      (!existing || existing.price === null || new Prisma.Decimal(existing.price).toString() !== currentPrice.toString());

    if (shouldWritePriceHistory) {
      await prisma.priceHistory.create({
        data: {
          offerId: offer.id,
          price: currentPrice,
          currency: item.currency || "USD",
        },
      });
      priceUpdates += 1;
    }

    await prisma.offerIngestEvent.create({
      data: {
        offerId: offer.id,
        partnerId: partner?.id ?? null,
        source: item.source,
        externalId: item.externalId,
        payload: (item.payload ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  return {
    processed: items.length,
    createdOffers,
    updatedOffers,
    priceUpdates,
  };
}
