"use client";

import { PageHeader } from "@/design-system/layout";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { getScopedModuleHeaderDescription, getScopedModuleHeaderTitle } from "@/lib/portal-copy";
import type { RoleKey, Ticket } from "@/lib/types";
import { TegelButton } from "./TegelUi";
import { TegelIcon, type TegelIconName } from "./TegelIcon";

export type ModuleHeaderNavItem = {
  key: string;
  label: string;
  iconName: TegelIconName;
};

export function ModuleHeader({
  activeModule,
  hasJiraProducts,
  role,
  selectedTicket,
  navItem,
  onNewTicket
}: {
  activeModule: string;
  hasJiraProducts: boolean;
  role: RoleKey;
  selectedTicket?: Ticket;
  navItem: ModuleHeaderNavItem;
  onNewTicket: () => void;
}) {
  const { locale, t } = useLocale();

  if (activeModule === "admin") {
    return null;
  }

  const title = getScopedModuleHeaderTitle(
    activeModule,
    role,
    activeModule === "tickets" ? "Search and filter support tickets" : navItem.label,
    locale
  );
  const description = getScopedModuleHeaderDescription(activeModule, role, {
    locale,
    selectedTicketKey: selectedTicket?.key,
    selectedTicketTitle: selectedTicket?.title,
    hasJiraProducts
  });

  if (activeModule === "tickets") {
    return (
      <PageHeader
        className="ticket-list-header"
        eyebrow={t.modules.tickets}
        title={title}
        description={description}
        actions={<TegelButton iconName="plus" text={t.shell.createTicket} onClick={onNewTicket} />}
      />
    );
  }

  return (
    <PageHeader
      title={title}
      description={description}
      icon={<TegelIcon name={navItem.iconName} size="26px" />}
      actions={<TegelButton iconName="support" text={t.shell.newTicket} onClick={onNewTicket} />}
    />
  );
}
