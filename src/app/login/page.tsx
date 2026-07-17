"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatEntraSignInError } from "@/lib/auth/msal-config";
import { TegelButton } from "@/components/nexus/TegelUi";
import { TegelIcon } from "@/components/nexus/TegelIcon";

function LoginPageContent() {
  const { isConfigured, isLoading, isAuthenticated, error, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState("");
  const returnTo = useMemo(() => {
    const value = searchParams.get("returnTo")?.trim() || "/";
    return value.startsWith("/") ? value : "/";
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, isLoading, returnTo, router]);

  async function handleSignIn() {
    setLocalError("");
    setIsSigningIn(true);

    try {
      await login(returnTo);
    } catch (signInError) {
      setLocalError(formatEntraSignInError(signInError));
      setIsSigningIn(false);
    }
  }

  const signInLabel = isAuthenticated
    ? "Opening portal…"
    : isSigningIn || isLoading
      ? "Connecting…"
      : "Sign in with Microsoft";

  return (
    <div className="auth-login-page">
      <div className="auth-login-atmosphere" aria-hidden="true">
        <div className="auth-login-hero-image" />
        <div className="auth-login-hero-veil" />
      </div>

      <div className="auth-login-shell">
        <section className="auth-login-panel" aria-labelledby="auth-login-title">
          <img
            className="auth-login-scania-logo auth-login-scania-logo-panel"
            src="/branding/scania-logo.png"
            alt="Scania"
            width={220}
            height={56}
          />
          <header className="auth-login-panel-header">
            <h2>Welcome</h2>
            <p>Use your Scania Microsoft account to continue.</p>
          </header>

          {!isConfigured ? (
            <div className="auth-login-alert" role="alert">
              <TegelIcon name="warning" size="18px" />
              <div>
                <strong>Entra ID is not configured</strong>
                <p>
                  Set <code>NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID</code> and{" "}
                  <code>NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID</code>, then restart the app.
                </p>
              </div>
            </div>
          ) : null}

          {error || localError ? (
            <div className="auth-login-alert" role="alert">
              <TegelIcon name="info" size="18px" />
              <div>
                <strong>Sign-in issue</strong>
                <p>{localError || error}</p>
              </div>
            </div>
          ) : null}

          <div className="auth-login-actions">
            <TegelButton
              className="auth-login-cta"
              disabled={!isConfigured || isLoading || isSigningIn || isAuthenticated}
              fullbleed
              iconName="profile"
              size="lg"
              text={signInLabel}
              onClick={() => {
                void handleSignIn();
              }}
            />
          </div>

          <p className="auth-login-footnote">
            Sign-in uses Graph User.Read only. Calendar permissions are requested later when you
            create a meeting.
          </p>
        </section>

        <aside className="auth-login-hero">
          <p className="auth-login-eyebrow">Industrial IT</p>
          <h1 id="auth-login-title" className="auth-login-title">
            Nexus-support
          </h1>
          <p className="auth-login-lede">
            Sign in with Entra ID to open the portal and create Outlook/Teams meetings as yourself.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-loading-screen" role="status">
          <div className="auth-loading-card">
            <img
              className="auth-login-scania-logo auth-login-scania-logo-compact"
              src="/branding/scania-logo.png"
              alt=""
              width={200}
              height={52}
            />
            <strong>Loading sign-in…</strong>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
