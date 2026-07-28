"use client";

import {
  ActivityFeed,
  AssignedTicketsPanel,
  AttentionPanel,
  CommandCenterAlertBanner,
  CommandCenterLayout,
  ContinueWorking,
  DashboardSection,
  MetricGrid,
  QueueOverview,
  ReportSection,
  type CommandCenterListItem,
  type CommandCenterMetric,
  type CommandCenterQueueItem,
  type CommandCenterReportRow
} from "@/design-system";

export type CommandCenterProps = {
  continueWorking: CommandCenterListItem[];
  criticalAlerts: CommandCenterListItem[];
  assignedTickets: CommandCenterListItem[];
  queues: CommandCenterQueueItem[];
  activity: CommandCenterListItem[];
  metrics: CommandCenterMetric[];
  reportRows: CommandCenterReportRow[];
  onOpenFirstCritical?: () => void;
  onOpenNotifications?: () => void;
  onOpenReleasePlan?: () => void;
};

/**
 * Operational Command Center composition.
 * Hierarchy: Continue → Critical → Assigned → Queues → Activity → Metrics → Reports
 */
export function CommandCenter({
  continueWorking,
  criticalAlerts,
  assignedTickets,
  queues,
  activity,
  metrics,
  reportRows,
  onOpenFirstCritical,
  onOpenNotifications,
  onOpenReleasePlan
}: CommandCenterProps) {
  return (
    <CommandCenterLayout>
      <ContinueWorking items={continueWorking} />

      <AttentionPanel
        title="Critical alerts"
        description="SLA breaches and critical follow-ups that need action first."
        items={criticalAlerts}
        banner={
          <CommandCenterAlertBanner
            count={criticalAlerts.length}
            onOpen={onOpenFirstCritical}
          />
        }
      />

      <AssignedTicketsPanel items={assignedTickets} />

      <QueueOverview items={queues} />

      <ActivityFeed
        title="Activity feed"
        description="What changed in your scope."
        items={activity}
        actions={
          onOpenNotifications ? (
            <button type="button" className="secondary-button" onClick={onOpenNotifications}>
              Open notifications
            </button>
          ) : undefined
        }
      />

      <DashboardSection
        title="Metrics"
        description="Four signals that frame workload — not a KPI wall."
      >
        <MetricGrid metrics={metrics} />
      </DashboardSection>

      <ReportSection
        title="Reports"
        description="Release outlook without decorative charts."
        rows={reportRows}
        emptyTitle="No release data"
        emptyBody="Tickets with fix versions will appear in this release summary."
        actions={
          onOpenReleasePlan ? (
            <button type="button" className="secondary-button" onClick={onOpenReleasePlan}>
              Open release plan
            </button>
          ) : undefined
        }
      />
    </CommandCenterLayout>
  );
}
