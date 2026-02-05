"use client";

import { useState, useEffect } from "react";
import { STORAGE_KEYS } from "@/lib/storage";

/**
 * Hook for managing persistent user ID
 * Creates a new UUID if none exists in localStorage
 */
export function useUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!id) {
      id = `user-${crypto.randomUUID()}`;
      localStorage.setItem(STORAGE_KEYS.USER_ID, id);
    }
    setUserId(id);
  }, []);

  return userId;
}
