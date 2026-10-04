"use client";
import { useCallback, useEffect, useRef } from "react";

const KEY = "swttrStayEditor";
/** A same-URL entry lets browser/native Back close the sheet before navigating. */
export function useTripEditorHistory(onBack: () => boolean, dirty: boolean) {
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; }, [onBack]);
  const marked = useRef(false);
  const ensureEntry = useCallback(() => {
    if (marked.current) return;
    window.history.pushState({ ...window.history.state, [KEY]: true }, "");
    marked.current = true;
  }, []);
  useEffect(() => {
    ensureEntry();
    const pop = () => {
      if (!marked.current) return;
      marked.current = false;
      if (back.current()) ensureEntry();
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      // Also cover unmount through application navigation.
      if (marked.current && window.history.state?.[KEY]) {
        window.history.replaceState({ ...window.history.state, [KEY]: undefined }, "");
      }
    };
  }, [ensureEntry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const leave = useCallback(() => {
    if (!marked.current) return;
    marked.current = false;
    window.history.back();
  }, []);
  return { ensureEntry, leave };
}
