"use client";

import { defineCustomElements, TdsIcon } from "@scania/tegel-react";
import type { ComponentProps } from "react";
import { useEffect } from "react";

export type TegelIconName = NonNullable<ComponentProps<typeof TdsIcon>["name"]>;

let areTegelElementsDefined = false;

function ensureTegelElements(): void {
  if (areTegelElementsDefined) {
    return;
  }

  defineCustomElements();
  areTegelElementsDefined = true;
}

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
  useEffect(() => {
    ensureTegelElements();
  }, []);

  return (
    <TdsIcon
      className={className}
      name={name}
      size={size}
      svgTitle={title}
      tdsAriaHidden={!title}
    />
  );
}
