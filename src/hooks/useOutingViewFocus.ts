"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** Gear up shows either its form or the results of an outing. */
export type OutingView = "form" | "results";

/** The heading each view's focus goes to: the form's "What should I wear?", and the results' page heading. */
export const OUTING_VIEW_HEADING_IDS = {
  form: "outing-form-heading",
  results: "outing-result-heading",
} as const satisfies Record<OutingView, string>;

/**
 * Moves focus to the heading of the view Gear up switches to, when the person
 * asked for that view (#284): the results of an outing they asked for, or the
 * form after Back or Edit outing. Without it, focus is lost with the view it
 * was in, since that view's elements are removed.
 *
 * Focus moves only when it would otherwise be lost: when the view switches,
 * it's on `<body>`, because the control that had it was removed with the old
 * view, or nothing had it. When it's on anything still on the page, like the
 * header or the sidebar, the person moved it there, and it stays. Updates
 * that keep the same view, like a re-evaluation or a changed activity on the
 * results, never move it.
 *
 * Call the returned function with the view the person's action leads to, or
 * with null when they didn't ask for it, like an outing a browser agent
 * submits. The latest call counts, until the view switches to it.
 */
export function useOutingViewFocus(view: OutingView) {
  const shown = useRef(view);
  const expected = useRef<OutingView | null>(null);

  useLayoutEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    // A switch to another view leaves the expectation for the one after it,
    // like a trip day's Plan again, which shows the form while its layers load.
    if (expected.current !== view) return;
    expected.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    document.getElementById(OUTING_VIEW_HEADING_IDS[view])?.focus({ preventScroll: true });
  }, [view]);

  return useCallback((next: OutingView | null) => {
    expected.current = next;
  }, []);
}
