"use client";

import { useEffect } from "react";
import { useUserId } from "@/hooks/useUserId";
import { claimGuestGearUpDraft } from "@/lib/gearUpDraft";

/**
 * Hands what a guest entered on Gear up in this tab to the first account that
 * signs in, on whichever page that happens, so no later account in the tab
 * can read it (see docs/outing-contract.md).
 */
export function useClaimGuestDraft() {
  const userId = useUserId();
  useEffect(() => {
    if (userId) claimGuestGearUpDraft(userId);
  }, [userId]);
}
