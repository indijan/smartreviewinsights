import { NextRequest, NextResponse } from "next/server";
import { OfferSource } from "@prisma/client";
import { getAdminTokenFromRequest, isAuthorizedAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdmin(getAdminTokenFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const partners = await prisma.partner.findMany({
    orderBy: [{ source: "asc" }, { name: "asc" }],
    include: {
      accounts: {
        orderBy: { updatedAt: "desc" },
      },
      _count: {
        select: { offers: true },
      },
    },
  });

  return NextResponse.json({ ok: true, partners });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdmin(getAdminTokenFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        type?: "partner" | "account";
        partnerId?: string;
        source?: OfferSource;
        name?: string;
        websiteUrl?: string;
        hasApi?: boolean;
        isEnabled?: boolean;
        notes?: string;
        label?: string;
        trackingId?: string;
        deepLinkPattern?: string;
      }
    | null;

  if (!body?.type) {
    return NextResponse.json({ ok: false, error: "type is required" }, { status: 400 });
  }

  if (body.type === "partner") {
    if (!body.name || !body.source) {
      return NextResponse.json({ ok: false, error: "name and source are required" }, { status: 400 });
    }

    const partner = await prisma.partner.create({
      data: {
        name: body.name,
        source: body.source,
        websiteUrl: body.websiteUrl || null,
        hasApi: Boolean(body.hasApi),
        isEnabled: body.isEnabled ?? true,
        notes: body.notes || null,
      },
    });

    return NextResponse.json({ ok: true, partner });
  }

  if (!body.partnerId || !body.label) {
    return NextResponse.json({ ok: false, error: "partnerId and label are required" }, { status: 400 });
  }

  const account = await prisma.affiliateAccount.create({
    data: {
      partnerId: body.partnerId,
      label: body.label,
      trackingId: body.trackingId || null,
      deepLinkPattern: body.deepLinkPattern || null,
      isActive: true,
    },
  });

  return NextResponse.json({ ok: true, account });
}
