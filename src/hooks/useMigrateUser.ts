"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { STORAGE_KEYS } from "@/lib/storage";
import { logWarn } from "@/lib/logger";

/**
 * One-time migration hook: if the user has a legacy localStorage UUID
 * and is now signed in via Clerk, reassigns their DB rows to the Clerk userId
 * then removes the localStorage key so it never runs again.
 */
export function useMigrateUser() {
  const { userId, isLoaded } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !userId || attempted.current) return;
    if (typeof window === "undefined") return;

    const legacyUserId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!legacyUserId) return;

    // Don't migrate if legacy ID matches Clerk ID (shouldn't happen, but guard)
    if (legacyUserId === userId) {
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      return;
    }

    attempted.current = true;

    fetch("/api/migrate-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legacyUserId }),
    })
      .then((res) => {
        if (res.ok) {
          localStorage.removeItem(STORAGE_KEYS.USER_ID);
        }
      })
      .catch((err) => {
        logWarn("useMigrateUser", err);
      });
  }, [isLoaded, userId]);
}
