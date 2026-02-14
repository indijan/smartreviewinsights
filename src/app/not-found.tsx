import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <div className="card">
        <h1 className="page-title">404</h1>
        <p className="page-sub">The requested page does not exist in the migrated content set.</p>
        <p style={{ marginTop: "0.9rem" }}>
          <Link className="btn" href="/">
            Go Back Home
          </Link>
        </p>
      </div>
    </main>
  );
}
