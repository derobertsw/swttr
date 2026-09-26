"use client";

import { useCallback, useEffect, useState } from "react";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";
import { DEFAULT_EXERTION_LEVEL, type ExertionLevel } from "@/lib/biophysics/exertion";

/**
 * The selected activity and exertion. The activity starts from the user's
 * default once preferences are ready (`defaultReady`) and follows the user's
 * choice after that.
 */
export function useActivitySelection(defaultActivity: string, defaultReady: boolean) {
  const [activity, setActivityState] = useState<string>(defaultActivity || DEFAULT_ACTIVITY);
  const [exertion, setExertion] = useState<ExertionLevel>(DEFAULT_EXERTION_LEVEL);
  const [initialized, setInitialized] = useState(false);

  if (!initialized && defaultReady && defaultActivity) {
    setInitialized(true);
    setActivityState(defaultActivity);
  }

  const setActivity = useCallback((next: string) => {
    setInitialized(true);
    setActivityState(next);
  }, []);

  const resetActivity = useCallback(() => {
    setActivityState(defaultActivity || DEFAULT_ACTIVITY);
    setInitialized(true);
    setExertion(DEFAULT_EXERTION_LEVEL);
  }, [defaultActivity]);

  // The iOS shell (ios/App/App/SWTTRViewController.swift) reads the stored
  // activity and listens for activityChange to update its native tab bar.
  useEffect(() => {
    const name = ACTIVITIES.find((item) => item.value === activity)?.name ?? "";
    localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, activity);
    window.dispatchEvent(new CustomEvent("activityChange", { detail: { name, value: activity } }));
  }, [activity]);

  return {
    activity,
    setActivity,
    exertion,
    setExertion,
    initializing: !initialized,
    resetActivity,
  };
}
