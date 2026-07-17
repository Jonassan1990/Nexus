import type { RoleKey } from "@/lib/types";
import { messages, type AppLocale } from "@/lib/i18n/messages";

export function getScopedModuleHeaderTitle(
  activeModule: string,
  role: RoleKey,
  fallbackLabel: string,
  locale: AppLocale = "en"
): string {
  if (activeModule === "dashboard" && role === "requester") {
    return locale === "sv" ? "Min supportsida" : "My support dashboard";
  }

  if (activeModule === "tickets" && role === "requester") {
    return locale === "sv" ? "Hitta supportärenden" : "Find support tickets";
  }

  if (activeModule === "releasePlan") {
    return messages[locale].modules.releasePlan;
  }

  return fallbackLabel;
}

export function getScopedModuleHeaderDescription(
  activeModule: string,
  role: RoleKey,
  options?: {
    locale?: AppLocale;
    selectedTicketKey?: string;
    selectedTicketTitle?: string;
    hasJiraProducts?: boolean;
  }
): string {
  const locale = options?.locale ?? "en";
  const copy = messages[locale].copy;
  const hasJiraProducts = options?.hasJiraProducts ?? true;

  if (activeModule === "dashboard") {
    return role === "requester" ? copy.dashboardRequester : copy.dashboardRole;
  }

  if (activeModule === "integrations") {
    return hasJiraProducts
      ? locale === "sv"
        ? "Jira API-synk och SMTP-e-postleverans."
        : "Jira API sync and SMTP email delivery configuration."
      : locale === "sv"
        ? "Plattformsintegrationer, AI-stöd, GitLab-kodgranskning och SMTP-e-post."
        : "Platform integrations, AI assistance, GitLab source review, and SMTP email delivery configuration.";
  }

  if (activeModule === "admin") {
    return locale === "sv"
      ? "Masterdata, ansvarsmappning, arbetsflöden, aviseringar och SLA-inställningar."
      : "Master data, responsibility mapping, workflows, notifications, and SLA settings.";
  }

  if (activeModule === "approvals") {
    return copy.approvals;
  }

  if (activeModule === "globalization") {
    return copy.globalization;
  }

  if (activeModule === "clarifications" && !options?.selectedTicketKey) {
    return copy.clarificationsEmpty;
  }

  if (activeModule === "escalations") {
    return copy.escalations;
  }

  if (activeModule === "tickets") {
    return role === "requester" ? copy.ticketsRequester : copy.ticketsRole;
  }

  if (activeModule === "releasePlan") {
    return copy.releasePlan;
  }

  if (options?.selectedTicketKey) {
    return `${options.selectedTicketKey} - ${options.selectedTicketTitle ?? ""}`.trim();
  }

  return locale === "sv"
    ? "Inget ärende valt. Skapa ett ärende för att fylla arbetsytan."
    : "No ticket selected. Create a ticket to populate this workspace.";
}

export function getTicketsEmptyCopy(
  hasActiveFilters: boolean,
  locale: AppLocale = "en"
): { title: string; body: string } {
  const copy = messages[locale].copy;

  return {
    title: copy.ticketsEmptyTitle,
    body: hasActiveFilters ? copy.ticketsEmptyFilteredBody : copy.ticketsEmptyBody
  };
}
