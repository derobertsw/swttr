"use client";

import { useContext, useSyncExternalStore } from "react";
import { detectNativeShell } from "@/lib/native-shell";
import { NativeShellContext } from "@/components/NativeShellProvider";

// The user agent is fixed for the page's lifetime.
const subscribe = () => () => {};

export function useNativeShell() {
  const shell = useContext(NativeShellContext);
  return useSyncExternalStore(
    subscribe,
    () => shell === undefined ? detectNativeShell(window.navigator.userAgent) : shell,
    () => shell ?? null
  );
}
