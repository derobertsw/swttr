"use client";

import { useEffect, useRef } from "react";
import { UserButton } from "@clerk/nextjs";
import { HelpCircle, Settings, Share2 } from "lucide-react";

// Clerk's menu hands focus back to the avatar in a microtask once it closes.
// Focus doesn't move if the avatar already had it, so don't wait for long.
const MENU_CLOSE_TIMEOUT_MS = 300;

// Clerk's trigger is only as big as its 28px avatar, and its faint focus halo
// replaces the app's focus outline. Clerk's styles outrank the app's layered
// CSS, so size the tap target and draw the usual outline through Clerk.
const APPEARANCE = {
  elements: {
    userButtonTrigger: {
      width: "2.75rem",
      height: "2.75rem",
      justifyContent: "center",
      borderRadius: "9999px",
      "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "2px", boxShadow: "none" },
    },
  },
};

interface AccountMenuProps {
  onOpenSettings: () => void;
  onShare: () => void;
}

/**
 * The signed-in avatar and its menu: SWTTR Settings first, then Clerk's
 * account management, FAQ, Share and, last, Sign out.
 */
export function AccountMenu({ onOpenSettings, onShare }: AccountMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const pendingSettings = useRef<AbortController | null>(null);

  useEffect(() => () => pendingSettings.current?.abort(), []);

  // Clerk calls this and then closes its menu, whose focus trap returns focus
  // to the avatar. Opening Settings before that would leave two overlays
  // fighting over focus, so wait until the avatar has it back.
  const openSettings = () => {
    pendingSettings.current?.abort();
    const pending = new AbortController();
    pendingSettings.current = pending;
    const open = () => {
      pending.abort();
      onOpenSettings();
    };
    rootRef.current?.addEventListener("focusin", open, { signal: pending.signal });
    const timer = window.setTimeout(open, MENU_CLOSE_TIMEOUT_MS);
    pending.signal.addEventListener("abort", () => window.clearTimeout(timer));
  };

  return (
    <span ref={rootRef} className="inline-flex">
      <UserButton appearance={APPEARANCE}>
        <UserButton.MenuItems>
          <UserButton.Action label="Settings" labelIcon={<Settings size={16} />} onClick={openSettings} />
          <UserButton.Action label="manageAccount" />
          <UserButton.Link label="FAQ" labelIcon={<HelpCircle size={16} />} href="/faq" />
          <UserButton.Action label="Share" labelIcon={<Share2 size={16} />} onClick={onShare} />
          <UserButton.Action label="signOut" />
        </UserButton.MenuItems>
      </UserButton>
    </span>
  );
}
