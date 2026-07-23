"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Nexus route error", error);
  }, [error]);

  return (
    <main className="app-recovery" id="main-content">
      <section aria-labelledby="route-error-title" className="app-recovery-card">
        <p className="app-recovery-eyebrow">Nexus-support portal</p>
        <h1 id="route-error-title">This workspace could not be loaded</h1>
        <p>
          Your data has not been changed. Try loading the workspace again. If the problem continues, contact
          the support team with the time of this error.
        </p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
