import type { ReactNode } from "react";

/* The UI fixture has no Auth account. Policy acceptance is exercised against
   real Auth by the full-stack suite; production builds use the real gate. */
export function PolicyGate({ children }: { children: ReactNode }) {
  return children;
}
