import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAffiliatesPage({ searchParams }: Props) {
  await searchParams;

  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const [partners, offerCounts] = await Promise.all([
    prisma.partner.findMany({
      orderBy: [{ source: "asc" }, { name: "asc" }],
      include: { accounts: { orderBy: { updatedAt: "desc" } } },
    }),
    prisma.offer.groupBy({
      by: ["source"],
      _count: true,
    }),
  ]);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Affiliate Admin</h1>
        <p className="page-sub">Partners, tracking accounts, and offer-source coverage.</p>
      </div>

      <section className="card">
        <h2>Offer Coverage</h2>
        <div className="grid-list" style={{ marginTop: "0.8rem" }}>
          {offerCounts.map((row) => (
            <p key={row.source}>
              {row.source}: {row._count}
            </p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Quick Add eBay Partner</h2>
        <p className="page-sub">Add/update eBay and optionally create one affiliate account in one step.</p>
        <form action="/admin/affiliates/quick-add-ebay" method="post" style={{ marginTop: "0.6rem", display: "grid", gap: "0.6rem", maxWidth: 760 }}>
          <label>
            <strong>Account Label</strong>
            <input
              name="label"
              defaultValue="eBay account"
              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.6rem" }}
            />
          </label>
          <label>
            <strong>Tracking ID (optional)</strong>
            <input
              name="trackingId"
              placeholder="campaign or tracking id"
              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.6rem" }}
            />
          </label>
          <label>
            <strong>Deep Link Pattern (recommended)</strong>
            <input
              name="deepLinkPattern"
              placeholder="https://your-aff-network.example/?url={url}&q={query}"
              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.6rem" }}
            />
          </label>
          <button className="btn" type="submit" style={{ width: "fit-content" }}>
            Save eBay Partner
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Partners</h2>
        <div className="grid-list" style={{ marginTop: "0.8rem" }}>
          {partners.length === 0 ? (
            <p className="page-sub">No partners yet. Use POST /api/admin/affiliates to add one.</p>
          ) : (
            partners.map((partner) => (
              <article key={partner.id} className="card">
                <h3>
                  {partner.name} [{partner.source}] {partner.hasApi ? "· API" : "· no API"} {partner.isEnabled ? "· ENABLED" : "· DISABLED"}
                </h3>
                <form action={`/admin/affiliates/partners/${partner.id}/save`} method="post" style={{ marginTop: 8, display: "grid", gap: "0.5rem" }}>
                  <label>
                    <strong>Partner Name</strong>
                    <input
                      name="name"
                      defaultValue={partner.name}
                      style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                    />
                  </label>
                  <label>
                    <strong>Website</strong>
                    <input
                      name="websiteUrl"
                      defaultValue={partner.websiteUrl ?? ""}
                      placeholder="https://..."
                      style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                    />
                  </label>
                  <label>
                    <strong>Notes</strong>
                    <input
                      name="notes"
                      defaultValue={partner.notes ?? ""}
                      style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                    />
                  </label>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" name="hasApi" defaultChecked={partner.hasApi} />
                    API enabled partner
                  </label>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" name="isEnabled" defaultChecked={partner.isEnabled} />
                    Include this partner in offer generation/display
                  </label>
                  <div className="pager-row">
                    <button className="btn" type="submit">
                      Save Partner
                    </button>
                    <span className="meta">Use the checkbox above to enable/disable this partner.</span>
                  </div>
                </form>

                <div style={{ marginTop: "0.7rem" }}>
                  <strong>Accounts</strong>
                  {partner.accounts.length === 0 ? (
                    <p className="meta">No affiliate accounts yet.</p>
                  ) : (
                    <div style={{ marginTop: "0.4rem", display: "grid", gap: "0.6rem" }}>
                      {partner.accounts.map((account) => (
                        <form key={account.id} action={`/admin/affiliates/accounts/${account.id}/save`} method="post" className="card" style={{ display: "grid", gap: "0.5rem" }}>
                          <label>
                            <strong>Label</strong>
                            <input
                              name="label"
                              defaultValue={account.label}
                              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                            />
                          </label>
                          <label>
                            <strong>Tracking ID</strong>
                            <input
                              name="trackingId"
                              defaultValue={account.trackingId ?? ""}
                              placeholder="tracking / campaign id"
                              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                            />
                          </label>
                          <label>
                            <strong>Deep Link Pattern</strong>
                            <input
                              name="deepLinkPattern"
                              defaultValue={account.deepLinkPattern ?? ""}
                              placeholder="https://affiliate.example/?url={url}&q={query}"
                              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                            />
                          </label>
                          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <input type="checkbox" name="isActive" defaultChecked={account.isActive} />
                            Active account
                          </label>
                          <button className="chip" type="submit" style={{ width: "fit-content" }}>
                            Save Account
                          </button>
                        </form>
                      ))}
                    </div>
                  )}

                  <form action="/admin/affiliates/accounts/create" method="post" className="card" style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <h4 style={{ margin: 0 }}>Add New Account</h4>
                    <label>
                      <strong>Label</strong>
                      <input
                        name="label"
                        placeholder={`${partner.name} main account`}
                        style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                      />
                    </label>
                    <label>
                      <strong>Tracking ID</strong>
                      <input
                        name="trackingId"
                        placeholder="tracking / campaign id"
                        style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                      />
                    </label>
                    <label>
                      <strong>Deep Link Pattern</strong>
                      <input
                        name="deepLinkPattern"
                        placeholder="https://affiliate.example/?url={url}&q={query}"
                        style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                      />
                    </label>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" name="isActive" defaultChecked />
                      Active account
                    </label>
                    <button className="chip" type="submit" style={{ width: "fit-content" }}>
                      Add Account
                    </button>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <p style={{ marginTop: "1rem" }}>
        <Link className="btn" href="/admin/analytics">
          Open Click Analytics
        </Link>
      </p>
    </main>
  );
}
