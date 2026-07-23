"use client";

import { TdsIcon } from "@scania/tegel-react";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { ensureTegelElements } from "./TegelProvider";

export type TegelIconName = NonNullable<ComponentProps<typeof TdsIcon>["name"]>;

export function TegelIcon({
  name,
  size = "18px",
  title,
  className = ""
}: {
  name: TegelIconName;
  size?: string;
  title?: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureTegelElements();
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        aria-hidden={!title}
        className={`tegel-icon-fallback ${className}`.trim()}
        style={{ width: size, height: size }}
        title={title}
      />
    );
  }

  return <TdsIcon className={className} name={name} size={size} svgTitle={title} tdsAriaHidden={!title} />;
}
