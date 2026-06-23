import { listTickets } from "@/lib/local-database";
import { summarizeWorkflowHealth } from "@/lib/workflow-engine";
import { TegelIcon } from "./TegelIcon";

export function TvDashboard() {
  const tickets = listTickets();
  const breached = tickets.filter((ticket) => ticket.slaState === "breach").length;
  const watch = tickets.filter((ticket) => ticket.slaState === "watch").length;
  const healthy = tickets.filter((ticket) => ticket.slaState === "healthy").length;

  return (
    <main className="tv-shell">
      <header className="tv-header">
        <div>
          <h1>Nexus-support portal operations</h1>
          <p>SLA monitoring, escalation focus, and governed workflow throughput</p>
        </div>
        <span>Live governance board</span>
      </header>
      <section className="tv-metrics" aria-label="SLA health summary">
        <div className="tv-metric state-healthy">
          <TegelIcon name="tick" size="42px" />
          <span>Healthy</span>
          <strong>{healthy}</strong>
        </div>
        <div className="tv-metric state-watch">
          <TegelIcon name="clock" size="42px" />
          <span>Watch</span>
          <strong>{watch}</strong>
        </div>
        <div className="tv-metric state-breach">
          <TegelIcon name="warning" size="42px" />
          <span>Breach</span>
          <strong>{breached}</strong>
        </div>
      </section>
      <section className="tv-ticket-grid">
        {tickets.map((ticket) => {
          const health = summarizeWorkflowHealth(ticket);

          return (
            <article className={`tv-ticket state-${ticket.slaState}`} key={ticket.key}>
              <div className="tv-ticket-top">
                <strong>{ticket.key}</strong>
                <span>{ticket.slaLabel}</span>
              </div>
              <h2>{ticket.title}</h2>
              <p>
                {ticket.product} · {ticket.site}
              </p>
              <div className="tv-progress">
                <TegelIcon name="route" size="22px" />
                <span>
                  {health.completed}/{health.total} gates complete
                </span>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
