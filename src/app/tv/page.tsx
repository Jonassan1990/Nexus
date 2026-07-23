import type { Metadata } from "next";
import { TvDashboard } from "@/components/nexus/TvDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations board",
  description: "Live SLA monitoring, escalation focus, and governed workflow throughput."
};

export default function TvPage() {
  return <TvDashboard />;
}
