"use client";

import { useSyncExternalStore } from "react";
import { detectNativeShell } from "@/lib/native-shell";

// The user agent is fixed for the page's lifetime.
const subscribe = () => () => {};

export function useNativeShell() {
  return useSyncExternalStore(
    subscribe,
    () => detectNativeShell(window.navigator.userAgent),
    () => null
  );
}
