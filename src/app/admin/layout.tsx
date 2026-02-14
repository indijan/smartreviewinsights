import Link from "next/link";
import { isAdminSession } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = await isAdminSession();

  return (
    <>
      <main>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h1 className="page-title" style={{ fontSize: "1.5rem" }}>
            Admin
          </h1>
          <div className="pager-row" style={{ marginTop: "0.6rem" }}>
            <Link className="chip" href="/admin/affiliates">
              Affiliates
            </Link>
            <Link className="chip" href="/admin/posts">
              Posts
            </Link>
            <Link className="chip" href="/admin/automation">
              Automation
            </Link>
            <Link className="chip" href="/admin/automation/insights">
              Automation Insights
            </Link>
            <Link className="chip" href="/admin/analytics">
              Analytics
            </Link>
            {loggedIn ? (
              <form action="/admin/auth/logout" method="post">
                <button className="chip" type="submit">
                  Logout
                </button>
              </form>
            ) : (
              <Link className="chip" href="/admin/login">
                Login
              </Link>
            )}
          </div>
        </div>
      </main>
      {children}
    </>
  );
}
