"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function sanitizeReturnTo(value: string | null): string {
  if (!value) {
    return "/";
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const errorText = searchParams.get("error");

  return (
    <main className="auth-loading-screen">
      <section className="auth-loading-card auth-login-card">
        <img
          className="auth-login-nexus-logo"
          src="/branding/nexus-header-mark.png"
          alt="Nexus Support"
          width={320}
          height={284}
        />
        <strong>Sign in with Microsoft Entra ID</strong>
        <p>You need a valid Scania account before the portal loads.</p>
        {errorText ? <p className="auth-login-error">{errorText}</p> : null}
        <a className="primary-button auth-login-button" href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
          Continue to sign in
        </a>
        <p className="auth-login-note">
          The portal uses the same Entra-backed login session configured for the docs environment.
        </p>
      </section>
    </main>
  );
}
