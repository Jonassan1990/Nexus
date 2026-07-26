"use client";

import type { AccountInfo } from "@azure/msal-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { formatEntraSignInError, getAccountEmail, isEntraConfigured } from "@/lib/auth/msal-config";
import {
  acquireGraphAccessToken,
  getActiveMsalAccount,
  getMsalInstance,
  handleMsalRedirect,
  loginWithEntraRedirect,
  logoutWithEntraRedirect
} from "@/lib/auth/msal-instance";
import { getNexusAuthMode } from "@/lib/auth/auth-mode";

export type AuthUser = {
  displayName: string;
  email: string;
  source: "entra" | "external";
};

type AuthContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  error: string;
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  refreshAccount: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(account: AccountInfo): AuthUser {
  return {
    displayName: account.name?.trim() || account.username || "Signed-in user",
    email: getAccountEmail(account),
    source: "entra"
  };
}

function readExternalUser(): Pick<AuthUser, "displayName" | "email"> {
  const envName = (process.env.NEXT_PUBLIC_NEXUS_TEST_USER_NAME ?? "").trim();
  const envEmail = (process.env.NEXT_PUBLIC_NEXUS_TEST_USER_EMAIL ?? "").trim().toLowerCase();

  if (typeof window === "undefined") {
    return { displayName: envName || "Signed-in user", email: envEmail };
  }

  return { displayName: envName || "Signed-in user", email: envEmail };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authMode = getNexusAuthMode();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  const refreshAccount = useCallback(() => {
    if (authMode === "external") {
      const externalUser = readExternalUser();
      setUser({ ...externalUser, source: "external" });
      return;
    }

    const account = getActiveMsalAccount();
    setUser(account ? toAuthUser(account) : null);
  }, [authMode]);

  useEffect(() => {
    let cancelled = false;

    async function fetchExternalUser(): Promise<Pick<AuthUser, "displayName" | "email"> | null> {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json().catch(() => null)) as
          | {
              data?: {
                name?: unknown;
                email?: unknown;
              };
            }
          | null;

        const name = payload?.data?.name;
        const email = payload?.data?.email;

        if (typeof name !== "string" && typeof email !== "string") {
          return null;
        }

        return {
          displayName: typeof name === "string" && name.trim() ? name.trim() : "Signed-in user",
          email: typeof email === "string" ? email.trim().toLowerCase() : ""
        };
      } catch {
        return null;
      }
    }

    async function bootstrap() {
      setIsLoading(true);
      setError("");

      try {
        if (authMode === "external") {
          if (!cancelled) {
            setIsConfigured(true);
            setUser({ ...readExternalUser(), source: "external" });
          }

          const externalUser = await fetchExternalUser();
          if (!cancelled && externalUser) {
            setUser({ ...externalUser, source: "external" });
          }
          return;
        }

        const configured = isEntraConfigured();

        if (!cancelled) {
          setIsConfigured(configured);
        }

        if (!configured) {
          if (!cancelled) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }

        await getMsalInstance();
        await handleMsalRedirect();

        if (!cancelled) {
          refreshAccount();
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(formatEntraSignInError(bootstrapError));
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [authMode, refreshAccount]);

  const login = useCallback(async (returnTo = "/") => {
    setError("");

    if (authMode === "external") {
      return;
    }

    await loginWithEntraRedirect(returnTo);
  }, [authMode]);

  const logout = useCallback(async () => {
    setError("");

    if (authMode === "external") {
      return;
    }

    await logoutWithEntraRedirect();
  }, [authMode]);

  const getAccessToken = useCallback(async () => {
    if (authMode === "external") {
      throw new Error("Graph access tokens are unavailable when NEXT_PUBLIC_NEXUS_AUTH_MODE=external.");
    }

    return acquireGraphAccessToken();
  }, [authMode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured,
      isLoading,
      isAuthenticated: authMode === "external" ? true : Boolean(user),
      user,
      error,
      login,
      logout,
      getAccessToken,
      refreshAccount
    }),
    [authMode, error, getAccessToken, isConfigured, isLoading, login, logout, refreshAccount, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
