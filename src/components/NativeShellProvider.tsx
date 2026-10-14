"use client";

import { createContext, type ReactNode } from "react";
import type { NativeShell } from "@/lib/native-shell";

// Undefined means no provider (isolated components/tests); null is a browser.
export const NativeShellContext = createContext<NativeShell | undefined>(undefined);

export function NativeShellProvider({ shell, children }: { shell: NativeShell; children: ReactNode }) {
  return <NativeShellContext.Provider value={shell}>{children}</NativeShellContext.Provider>;
}
