"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";

export function AuthGate({ children }: { children: ReactNode }) {
  const authMode = getNexusAuthMode();
  const { isConfigured, isLoading, isAuthenticated, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (authMode === "external") {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!isConfigured || !isAuthenticated) {
      const returnTo = pathname && pathname !== "/login" ? pathname : "/";
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [authMode, isAuthenticated, isConfigured, isLoading, pathname, router]);

  if (authMode === "external") {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <img
            className="auth-login-nexus-logo"
            src="/branding/nexus-header-mark.png"
            alt="Nexus Support"
            width={320}
            height={284}
          />
          <strong>Checking Microsoft Entra session…</strong>
          <p>Preparing Nexus Support.</p>
        </div>
      </div>
    );
  }

  if (!isConfigured || !isAuthenticated) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <img
            className="auth-login-nexus-logo"
            src="/branding/nexus-header-mark.png"
            alt="Nexus Support"
            width={320}
            height={284}
          />
          <strong>Redirecting to sign-in…</strong>
          <p>{error || "You need to sign in with Microsoft Entra ID."}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
