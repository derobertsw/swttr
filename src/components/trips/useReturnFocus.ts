import { useCallback, useMemo, useRef } from "react";

interface Opener {
  element: HTMLElement | null;
  fallback: () => HTMLElement | null;
}

/**
 * Radix returns focus only to a DialogTrigger, so a trip sheet opened from
 * state leaves focus on <body> when it closes. Call `remember` as the sheet
 * opens and pass `restore` to its `onCloseAutoFocus`: focus goes back to the
 * control that opened it, or to `fallback` when a tap left nothing focused or
 * the opener is gone. `forget` drops the opener when focus should go
 * somewhere else.
 */
export function useReturnFocus() {
  const opener = useRef<Opener | null>(null);

  const remember = useCallback((fallback: () => HTMLElement | null) => {
    const active = document.activeElement;
    opener.current = {
      element: active instanceof HTMLElement && active !== document.body ? active : null,
      fallback,
    };
  }, []);

  const restore = useCallback((event: Event) => {
    const saved = opener.current;
    opener.current = null;
    if (!saved) return;
    event.preventDefault();
    if (saved.element?.isConnected) {
      saved.element.focus();
    } else {
      // A tap leaves nothing focused, or the opener went away; don't scroll
      // the page to the fallback.
      saved.fallback()?.focus({ preventScroll: true });
    }
  }, []);

  const forget = useCallback(() => {
    opener.current = null;
  }, []);

  return useMemo(() => ({ remember, restore, forget }), [remember, restore, forget]);
}
