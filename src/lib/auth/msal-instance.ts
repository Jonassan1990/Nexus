import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration
} from "@azure/msal-browser";
import {
  getEntraPublicConfig,
  graphLoginScopes,
  graphMeetingScopes,
  graphTokenScopes
} from "./msal-config";

let msalClient: PublicClientApplication | null = null;
let msalClientInit: Promise<PublicClientApplication> | null = null;
let msalConfigKey = "";
let redirectHandled = false;

function selectAccount(accounts: AccountInfo[]): AccountInfo | null {
  return accounts[0] ?? null;
}

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (typeof window === "undefined") {
    throw new Error("Microsoft Entra sign-in is only available in the browser.");
  }

  const { clientId, tenantId, redirectUri, authority } = getEntraPublicConfig();
  const nextConfigKey = [clientId, tenantId, redirectUri].join("|");

  if (msalConfigKey && msalConfigKey !== nextConfigKey) {
    msalClient = null;
    msalClientInit = null;
    redirectHandled = false;
  }

  if (msalClient) {
    return msalClient;
  }

  if (!msalClientInit) {
    msalClientInit = (async () => {
      const configuration: Configuration = {
        auth: {
          clientId,
          authority,
          redirectUri,
          postLogoutRedirectUri: redirectUri
        },
        cache: {
          cacheLocation: "memoryStorage"
        }
      };
      const client = new PublicClientApplication(configuration);

      await client.initialize();
      msalClient = client;
      msalConfigKey = nextConfigKey;

      return client;
    })();
  }

  return msalClientInit;
}

export async function handleMsalRedirect(): Promise<AuthenticationResult | null> {
  const client = await getMsalInstance();

  if (redirectHandled) {
    return null;
  }

  redirectHandled = true;
  const result = await client.handleRedirectPromise();

  if (result?.account) {
    client.setActiveAccount(result.account);
  } else {
    const existing = client.getActiveAccount() ?? selectAccount(client.getAllAccounts());

    if (existing) {
      client.setActiveAccount(existing);
    }
  }

  return result;
}

export function getActiveMsalAccount(): AccountInfo | null {
  if (!msalClient) {
    return null;
  }

  return msalClient.getActiveAccount() ?? selectAccount(msalClient.getAllAccounts());
}

export async function loginWithEntraRedirect(returnTo = "/"): Promise<void> {
  const client = await getMsalInstance();

  await client.loginRedirect({
    scopes: [...graphLoginScopes],
    redirectStartPage: typeof window !== "undefined" ? `${window.location.origin}${returnTo}` : returnTo
  });
}

export async function logoutWithEntraRedirect(): Promise<void> {
  const client = await getMsalInstance();
  const account = getActiveMsalAccount();

  await client.logoutRedirect({
    account: account ?? undefined,
    postLogoutRedirectUri:
      typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"
  });
}

export async function acquireGraphAccessToken(
  scopes: readonly string[] = graphTokenScopes
): Promise<string> {
  const client = await getMsalInstance();
  const account = client.getActiveAccount() ?? selectAccount(client.getAllAccounts());
  const requestedScopes = [...scopes];

  if (!account) {
    await loginWithEntraRedirect(typeof window !== "undefined" ? window.location.pathname : "/");
    throw new Error("Redirecting to Microsoft Entra ID sign-in.");
  }

  try {
    const silentResult = await client.acquireTokenSilent({
      account,
      scopes: requestedScopes
    });

    client.setActiveAccount(silentResult.account);

    if (!silentResult.accessToken) {
      throw new Error("Microsoft Graph silent token acquisition did not return an access token.");
    }

    return silentResult.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      throw error;
    }

    const popupResult = await client.acquireTokenPopup({
      account,
      scopes: requestedScopes
    });

    client.setActiveAccount(popupResult.account);

    if (!popupResult.accessToken) {
      throw new Error("Microsoft Graph token popup did not return an access token.");
    }

    return popupResult.accessToken;
  }
}

export async function acquireGraphMeetingAccessToken(): Promise<string> {
  return acquireGraphAccessToken(graphMeetingScopes);
}
