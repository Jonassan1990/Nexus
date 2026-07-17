"use client";

import { defineCustomElements } from "@scania/tegel-react";
import { useEffect, type ReactNode } from "react";

let areTegelElementsDefined = false;

export function ensureTegelElements(): void {
  if (areTegelElementsDefined || typeof window === "undefined") {
    return;
  }

  defineCustomElements();
  areTegelElementsDefined = true;
}

export function TegelProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureTegelElements();
  }, []);

  return <>{children}</>;
}
