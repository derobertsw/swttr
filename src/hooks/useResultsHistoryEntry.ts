"use client";

import { useCallback, useEffect, useRef } from "react";

/** What to do on the browser's Back and Forward (see useResultsHistoryEntry). */
interface BrowserNavigation {
  /** The browser went from the results entry to an earlier one. */
  onBack: () => void;
  /** The browser went to a results entry. */
  onForward: () => void;
}

/** The history.state field that marks the entry Gear up's results are shown in. */
const RESULTS_ENTRY_KEY = "swttrGearUp";

function isResultsEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as Record<string, unknown>)[RESULTS_ENTRY_KEY] === "results";
}

/**
 * Gives Gear up's results their own browser history entry, at the same URL,
 * so the browser's Back leaves the results for the form and Forward comes
 * back to them (see docs/outing-contract.md). When results show from the
 * form, an entry is pushed for them.
 *
 * Next.js keeps the field when it updates the entry for Back and Forward, and
 * a reload keeps it too, so `isOnResultsEntry` still says so after a reload.
 */
export function useResultsHistoryEntry(showingResults: boolean) {
  // Read from history.state on first use, since it outlives a reload.
  const onEntry = useRef<boolean | null>(null);
  // Set while our own history.back() is on its way, so its popstate isn't taken for the person's.
  const ownTraversal = useRef(false);
  /**
   * Set by the caller after each render. The popstate listener is added once
   * and reads it: a listener removed and added again while the browser
   * dispatches popstate is skipped, and Next.js's own listener re-renders the
   * page before ours runs.
   */
  const navigationRef = useRef<BrowserNavigation | null>(null);

  const isOnResultsEntry = useCallback(() => {
    onEntry.current ??= isResultsEntry(window.history.state);
    return onEntry.current;
  }, []);

  useEffect(() => {
    if (showingResults && !isOnResultsEntry()) {
      window.history.pushState({ [RESULTS_ENTRY_KEY]: "results" }, "");
      onEntry.current = true;
    }
  }, [showingResults, isOnResultsEntry]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      onEntry.current = isResultsEntry(event.state);
      if (ownTraversal.current) {
        ownTraversal.current = false;
        return;
      }
      if (onEntry.current) navigationRef.current?.onForward();
      else navigationRef.current?.onBack();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /**
   * Steps back over the results entry when the page leaves the results by
   * itself, like Edit outing, so the browser's next Back leaves Gear up
   * instead of landing on the same form.
   */
  const leaveResultsEntry = useCallback(() => {
    if (!isOnResultsEntry()) return;
    onEntry.current = false;
    ownTraversal.current = true;
    window.history.back();
  }, [isOnResultsEntry]);

  /**
   * Unmarks the results entry without stepping back, for the logo. The logo is
   * a link to /, and stepping back while Next.js follows it could undo the link.
   */
  const forgetResultsEntry = useCallback(() => {
    if (!isOnResultsEntry()) return;
    onEntry.current = false;
    window.history.replaceState(null, "");
  }, [isOnResultsEntry]);

  return { isOnResultsEntry, navigationRef, leaveResultsEntry, forgetResultsEntry };
}
