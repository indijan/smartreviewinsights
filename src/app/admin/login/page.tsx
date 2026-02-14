import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";

export default async function AdminLoginPage() {
  if (await isAdminSession()) {
    redirect("/admin/affiliates");
  }

  return (
    <main>
      <div className="card" style={{ maxWidth: 480 }}>
        <h1 className="page-title" style={{ fontSize: "1.6rem" }}>
          Admin Login
        </h1>
        <p className="page-sub">Enter your admin token to access private admin routes.</p>

        <form
          action="/admin/auth/login"
          method="post"
          style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}
        >
          <input
            name="token"
            type="password"
            required
            placeholder="Admin token"
            style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.75rem" }}
          />
          <button className="btn" type="submit" style={{ width: "fit-content" }}>
            Login
          </button>
        </form>
      </div>
    </main>
  );
}
