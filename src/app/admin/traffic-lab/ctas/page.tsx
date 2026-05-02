import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabCtasPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const variants = await prisma.trafficCtaVariant.findMany({ orderBy: [{ updatedAt: "desc" }] });

  return (
    <main>
      <h1 className="page-title">Traffic Lab CTA Variants</h1>
      <form action="/admin/traffic-lab/ctas/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Create CTA Variant</h2>
        <input name="slug" placeholder="compare-now" />
        <input name="ctaText" placeholder="Compare the best options" />
        <input name="ctaSubtext" placeholder="See what fits your situation" />
        <div className="pager-row">
          <input name="buttonText" placeholder="Compare Now" />
          <input name="angle" placeholder="compare_now" />
          <input name="status" placeholder="active" />
        </div>
        <button className="btn" type="submit">Save CTA Variant</button>
      </form>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Existing CTA Variants</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {variants.map((variant) => (
            <p key={variant.id}>{variant.ctaText} · {variant.buttonText} · {variant.angle}</p>
          ))}
        </div>
      </section>
    </main>
  );
}
