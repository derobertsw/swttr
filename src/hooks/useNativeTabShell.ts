"use client";

import { useSyncExternalStore } from "react";

const NATIVE_TABS_USER_AGENT_MARKER = "SWTTRNativeTabs";

// The user agent is fixed for the page's lifetime, so there is nothing to subscribe to.
const subscribe = () => () => {};

export function useNativeTabShell() {
  return useSyncExternalStore(
    subscribe,
    () => (window.navigator.userAgent || "").includes(NATIVE_TABS_USER_AGENT_MARKER),
    () => false
  );
}
