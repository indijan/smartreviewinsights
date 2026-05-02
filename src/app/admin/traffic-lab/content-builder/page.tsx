import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficContentBuilderPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const [niches, pages, offers] = await Promise.all([
    prisma.trafficNiche.findMany({ where: { status: { not: "paused" } }, orderBy: [{ name: "asc" }] }),
    prisma.page.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ updatedAt: "desc" }], take: 100, select: { id: true, title: true, slug: true } }),
    prisma.trafficOffer.findMany({ where: { status: "active" }, orderBy: [{ updatedAt: "desc" }], take: 50, select: { id: true, name: true, slug: true } }),
  ]);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Traffic Lab Content Builder</h1>
        <p className="page-sub">Draft generator for entry articles, deep articles, comparison pages, quizzes, and checklists.</p>
      </div>

      <form action="/admin/traffic-lab/content-builder/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <label>
          <span>Niche</span>
          <select name="nicheId" defaultValue={niches[0]?.id ?? ""} required>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name} ({niche.slug})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Angle</span>
          <select name="angle" defaultValue="compare_now">
            <option value="compare_now">compare_now</option>
            <option value="avoid_mistake">avoid_mistake</option>
            <option value="save_money">save_money</option>
            <option value="best_choice">best_choice</option>
            <option value="checklist">checklist</option>
          </select>
        </label>

        <label>
          <span>Content type</span>
          <select name="contentType" defaultValue="entry_article">
            <option value="entry_article">entry article</option>
            <option value="deep_article">deep article</option>
            <option value="comparison">comparison</option>
            <option value="quiz">quiz</option>
            <option value="checklist">checklist</option>
          </select>
        </label>

        <label>
          <span>Title seed</span>
          <input name="titleSeed" type="text" placeholder="Why you wake up tired" required />
        </label>

        <label>
          <span>Internal links</span>
          <select name="internalLinkIds" multiple size={10} defaultValue={[]}>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title} ({page.slug})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Traffic offers</span>
          <select name="trafficOfferIds" multiple size={8} defaultValue={[]}>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} ({offer.slug})
              </option>
            ))}
          </select>
        </label>

        <button className="btn" type="submit">Generate Draft</button>
      </form>
    </main>
  );
}
