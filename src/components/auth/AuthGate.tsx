"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function AuthGate({ children }: { children: ReactNode }) {
  const { isConfigured, isLoading, isAuthenticated, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isConfigured || !isAuthenticated) {
      const returnTo = pathname && pathname !== "/login" ? pathname : "/";
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthenticated, isConfigured, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <img
            className="auth-login-scania-logo auth-login-scania-logo-compact"
            src="/branding/scania-logo.png"
            alt=""
            width={200}
            height={52}
          />
          <strong>Checking Microsoft Entra session…</strong>
          <p>Preparing the Nexus-support portal.</p>
        </div>
      </div>
    );
  }

  if (!isConfigured || !isAuthenticated) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <img
            className="auth-login-scania-logo auth-login-scania-logo-compact"
            src="/branding/scania-logo.png"
            alt=""
            width={200}
            height={52}
          />
          <strong>Redirecting to sign-in…</strong>
          <p>{error || "You need to sign in with Microsoft Entra ID."}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
