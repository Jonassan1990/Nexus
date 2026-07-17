"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  getScopedModuleHeaderDescription,
  getScopedModuleHeaderTitle
} from "@/lib/portal-copy";
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
      <section className="module-header ticket-list-header">
        <div>
          <span className="module-eyebrow">{t.modules.tickets}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="module-actions">
          <TegelButton iconName="plus" text={t.shell.createTicket} onClick={onNewTicket} />
        </div>
      </section>
    );
  }

  return (
    <section className="module-header">
      <div>
        <div className="module-title-row">
          <TegelIcon name={navItem.iconName} size="26px" />
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </div>
      <div className="module-actions">
        <TegelButton iconName="support" text={t.shell.newTicket} onClick={onNewTicket} />
      </div>
    </section>
  );
}
