import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-recovery" id="main-content">
      <section aria-labelledby="not-found-title" className="app-recovery-card">
        <p className="app-recovery-eyebrow">404</p>
        <h1 id="not-found-title">This page is not available</h1>
        <p>The address may be incorrect, or the workspace may no longer exist.</p>
        <Link className="primary-button" href="/">
          Open the portal
        </Link>
      </section>
    </main>
  );
}
