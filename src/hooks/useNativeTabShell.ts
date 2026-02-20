"use client";

import { useEffect, useState } from "react";

const NATIVE_TABS_USER_AGENT_MARKER = "SWTTRNativeTabs";

export function useNativeTabShell() {
  const [isNativeTabShell, setIsNativeTabShell] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userAgent = window.navigator.userAgent || "";
    setIsNativeTabShell(userAgent.includes(NATIVE_TABS_USER_AGENT_MARKER));
  }, []);

  return isNativeTabShell;
}

