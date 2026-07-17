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

export type AuthUser = {
  account: AccountInfo;
  displayName: string;
  email: string;
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
    account,
    displayName: account.name?.trim() || account.username || "Signed-in user",
    email: getAccountEmail(account)
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  const refreshAccount = useCallback(() => {
    const account = getActiveMsalAccount();
    setUser(account ? toAuthUser(account) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setError("");

      try {
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
  }, [refreshAccount]);

  const login = useCallback(async (returnTo = "/") => {
    setError("");
    await loginWithEntraRedirect(returnTo);
  }, []);

  const logout = useCallback(async () => {
    setError("");
    await logoutWithEntraRedirect();
  }, []);

  const getAccessToken = useCallback(async () => acquireGraphAccessToken(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured,
      isLoading,
      isAuthenticated: Boolean(user),
      user,
      error,
      login,
      logout,
      getAccessToken,
      refreshAccount
    }),
    [error, getAccessToken, isConfigured, isLoading, login, logout, refreshAccount, user]
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
