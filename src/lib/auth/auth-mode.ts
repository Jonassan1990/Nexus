export type NexusAuthMode = "entra" | "external" | "cognito";

export function getNexusAuthMode(): NexusAuthMode {
  const raw = (process.env.NEXT_PUBLIC_NEXUS_AUTH_MODE ?? "entra").trim().toLowerCase();

  if (raw === "external") {
    return "external";
  }

  if (raw === "cognito") {
    return "cognito";
  }

  return "entra";
}
