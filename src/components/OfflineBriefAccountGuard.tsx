"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { noteSignedInAccount, readSavedBriefs, reconcileSavedBriefs, savedBriefsAccountHint } from "@/lib/offline-briefs";
import { keepStartPageRedirect } from "@/lib/offline-shell";

/**
 * Trip briefs saved on this device belong to the account that saved them
 * (#214). On any page, once Clerk knows who's signed in, a device holding
 * another account's briefs, or briefs from before a sign-out made elsewhere,
 * clears them. Signing out from the account menu clears them first. It also
 * tells the storage who's signed in, so a save that finishes after the
 * account changed isn't written.
 */
export function OfflineBriefAccountGuard() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    // Saves still downloading for an account that's gone aren't written.
    noteSignedInAccount(userId ?? null);
    const hint = savedBriefsAccountHint();
    // Briefs saved before the start page's redirect existed get it too (registering again changes nothing).
    if (hint && hint === userId) void keepStartPageRedirect();
    // Nothing saved, or saved by whoever is signed in: nothing to do, and no database to open.
    if (hint === null || (hint !== undefined && hint === userId)) return;
    void (async () => {
      const account = hint ?? (await readSavedBriefs()).account;
      await reconcileSavedBriefs(userId ?? null, account);
    })().catch(() => undefined);
  }, [isLoaded, userId]);
  return null;
}
