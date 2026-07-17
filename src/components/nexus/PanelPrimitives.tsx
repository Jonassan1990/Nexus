import { TegelBanner } from "./TegelUi";
import { TegelIcon } from "./TegelIcon";
import type { TegelIconName } from "./TegelIcon";

export function PanelHeader({
  title,
  description,
  iconName,
  headingLevel = "h2"
}: {
  title: string;
  description: string;
  iconName: TegelIconName;
  headingLevel?: "h1" | "h2";
}) {
  return (
    <header className="panel-header">
      <div className="panel-icon">
        <TegelIcon name={iconName} size="19px" />
      </div>
      <div>
        {headingLevel === "h1" ? <h1>{title}</h1> : <h2>{title}</h2>}
        <p>{description}</p>
      </div>
    </header>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state tegel-empty-state">
      <TegelBanner header={title} iconName="info" subheader={body} variant="information" />
    </div>
  );
}
