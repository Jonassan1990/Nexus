/**
 * Theme token accessors for runtime styles (charts, SVG fills).
 * Prefer CSS classes; use these only when a style prop requires a color value.
 * Values are CSS variable references — never raw hex.
 */

export type ThemeCssVar = `var(--${string})`;

export const chartColorVars = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-muted)"
] as const satisfies readonly ThemeCssVar[];

export type ChartColorVar = (typeof chartColorVars)[number];

export const statusColorVars = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  primary: "var(--primary)",
  muted: "var(--chart-muted)"
} as const satisfies Record<string, ThemeCssVar>;

export type StatusColorVar = (typeof statusColorVars)[keyof typeof statusColorVars];

/** Priority / severity series mapped onto chart tokens for typed chart APIs. */
export const priorityChartColorVars = [
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-muted)"
] as const satisfies readonly ChartColorVar[];

export function chartColorAt(index: number): ChartColorVar {
  return chartColorVars[index % chartColorVars.length];
}
