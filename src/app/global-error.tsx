"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Nexus global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="app-recovery" id="main-content">
          <section aria-labelledby="global-error-title" className="app-recovery-card">
            <p className="app-recovery-eyebrow">Nexus-support portal</p>
            <h1 id="global-error-title">The portal is temporarily unavailable</h1>
            <p>Try again. If the problem persists, contact the support team.</p>
            <button className="primary-button" onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
