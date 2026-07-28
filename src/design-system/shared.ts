export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type Density = "compact" | "comfortable" | "relaxed";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

export type TicketStatusTone =
  | "open"
  | "in-progress"
  | "waiting"
  | "blocked"
  | "escalated"
  | "resolved"
  | "closed";
