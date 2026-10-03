import { useCallback, useEffect, useMemo, useRef } from "react";

interface Opener {
  element: HTMLElement | null;
  fallback: () => HTMLElement | null;
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

// The target of the click being handled. A tap on iOS doesn't focus the button
// it activates, so focus can still be on an earlier, unrelated control.
let clicked: Element | null = null;
let trackingClicks = false;

function trackClicks() {
  if (trackingClicks) return;
  trackingClicks = true;
  document.addEventListener(
    "click",
    (event) => {
      clicked = event.target instanceof Element ? event.target : null;
      // Cleared once every handler has seen this click.
      setTimeout(() => {
        clicked = null;
      });
    },
    true
  );
}

/** The control being clicked, or else the focused one. */
function activeControl(): HTMLElement | null {
  const target = clicked?.closest<HTMLElement>(FOCUSABLE);
  if (target) return target;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Radix returns focus only to a DialogTrigger, so an overlay opened from code
 * leaves focus on <body> when it closes. Call `remember` as the overlay opens
 * and pass `restore` to its content's `onCloseAutoFocus`: focus goes back to
 * the control that opened it, or to `fallback` when that control is gone.
 * `forget` drops the opener when focus should go somewhere else.
 */
export function useReturnFocus() {
  const opener = useRef<Opener | null>(null);

  useEffect(trackClicks, []);

  const remember = useCallback((fallback: () => HTMLElement | null) => {
    opener.current = { element: activeControl(), fallback };
  }, []);

  const restore = useCallback((event: Event) => {
    const saved = opener.current;
    opener.current = null;
    // Not opened from code: let Radix focus its trigger, if there is one.
    if (!saved) return;
    event.preventDefault();
    // Don't scroll the page: the opener was in view, and after a tap nothing
    // was focused there.
    if (saved.element?.isConnected) {
      saved.element.focus({ preventScroll: true });
    } else {
      saved.fallback()?.focus({ preventScroll: true });
    }
  }, []);

  const forget = useCallback(() => {
    opener.current = null;
  }, []);

  return useMemo(() => ({ remember, restore, forget }), [remember, restore, forget]);
}
