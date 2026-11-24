"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { HelpCircle, LogOut, Settings, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { clearSavedBriefs, countSavedBriefs, noteSignedInAccount, savedBriefsAccountHint } from "@/lib/offline-briefs";

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
    // Clerk keeps its own Sign out in the menu whatever MenuItems lists, and
    // its label can't take an onClick. Signing out must go through ours,
    // which warns about the trip briefs saved on this device (#214), so its
    // own sign-out actions are hidden ("&&" outranks Clerk's variant rules).
    userButtonPopoverActionButton__signOut: { display: "none", "&&": { display: "none" } },
    userButtonPopoverActionButton__signOutAll: { display: "none", "&&": { display: "none" } },
  },
};

// In the sidebar the trigger is the size of the other items: 32px, or 44px on
// touch screens.
const SIDEBAR_APPEARANCE = {
  elements: {
    ...APPEARANCE.elements,
    userButtonTrigger: {
      ...APPEARANCE.elements.userButtonTrigger,
      width: "2rem",
      height: "2rem",
      flexShrink: 0,
      "@media (pointer: coarse)": { width: "2.75rem", height: "2.75rem" },
    },
  },
};

interface AccountMenuProps {
  ref?: Ref<AccountMenuHandle>;
  /** "sidebar" adds the account's name beside the avatar, as a row that opens the same menu. */
  placement?: "header" | "sidebar";
  onOpenSettings: () => void;
  onShare: () => void;
}

export interface AccountMenuHandle {
  openSettings: () => void;
}

/**
 * The signed-in avatar and its menu: SWTTR Settings first, then Clerk's
 * account management, FAQ, Share and, last, Sign out. Signing out removes
 * the trip briefs saved on this device (#214), and asks first when there are some.
 */
export function AccountMenu({ ref, placement = "header", onOpenSettings, onShare }: AccountMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const pendingSettings = useRef<AbortController | null>(null);
  const { signOut, user } = useClerk();
  const inSidebar = placement === "sidebar";
  // Whether the menu was open as a press on the name began. That press closes
  // it, and the click that follows must not open it again.
  const openAtPress = useRef(false);
  const trigger = () => rootRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? null;
  const { userId } = useAuth();
  // How many saved trip briefs signing out would remove, while that's being confirmed.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => () => pendingSettings.current?.abort(), []);

  // Clerk calls a menu action and then closes its menu, whose focus trap
  // returns focus to the avatar. Opening an overlay before that would leave
  // two overlays fighting over focus, so wait until the avatar has it back.
  const afterMenuCloses = (run: () => void) => {
    pendingSettings.current?.abort();
    const pending = new AbortController();
    pendingSettings.current = pending;
    const open = () => {
      pending.abort();
      run();
    };
    rootRef.current?.addEventListener("focusin", open, { signal: pending.signal });
    const timer = window.setTimeout(open, MENU_CLOSE_TIMEOUT_MS);
    pending.signal.addEventListener("abort", () => window.clearTimeout(timer));
  };
  const openSettings = () => afterMenuCloses(onOpenSettings);

  const finishSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    // A save still downloading for this account mustn't land after the clear.
    noteSignedInAccount(null);
    // Always cleared, even with nothing saved here, so a save still
    // downloading in another tab is refused too.
    try {
      await clearSavedBriefs();
    } catch {
      // Storage this browser won't open can't hold any; otherwise saved trips
      // stay on this device, so the account stays signed in, and says why.
      if (savedBriefsAccountHint() !== null) {
        noteSignedInAccount(userId ?? null);
        setSignOutError("Couldn't remove the trips saved on this device, so you're still signed in. Try again, or remove them from Trips, then Saved on this device.");
        setConfirming((count) => count ?? 0);
        setSigningOut(false);
        return;
      }
    }
    try {
      await signOut();
    } catch {
      noteSignedInAccount(userId ?? null);
      setSigningOut(false);
    }
  };
  const requestSignOut = () => afterMenuCloses(() => {
    void (userId ? countSavedBriefs(userId) : Promise.resolve(0)).then((count) => {
      if (count > 0) setConfirming(count);
      else void finishSignOut();
    });
  });

  useImperativeHandle(ref, () => ({
    openSettings: () => {
      if (pendingSettings.current && !pendingSettings.current.signal.aborted) return;
      const trigger = rootRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]");
      if (trigger?.getAttribute("aria-expanded") === "true") {
        openSettings();
        // Toggle the same accessible trigger that opened Clerk's popover.
        trigger.click();
      } else {
        onOpenSettings();
      }
    },
  }));

  return (
    <span
      ref={rootRef}
      className={cn(
        "inline-flex",
        inSidebar &&
          "min-h-10 w-full items-center gap-2 rounded-control text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:min-h-0 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:hover:bg-transparent"
      )}
    >
      <UserButton appearance={inSidebar ? SIDEBAR_APPEARANCE : APPEARANCE}>
        <UserButton.MenuItems>
          <UserButton.Action label="Settings" labelIcon={<Settings size={16} />} onClick={openSettings} />
          <UserButton.Action label="manageAccount" />
          <UserButton.Link label="FAQ" labelIcon={<HelpCircle size={16} />} href="/faq" />
          <UserButton.Action label="Share" labelIcon={<Share2 size={16} />} onClick={onShare} />
          <UserButton.Action label="Sign out" labelIcon={<LogOut size={16} />} onClick={requestSignOut} />
        </UserButton.MenuItems>
      </UserButton>
      {inSidebar && (
        // A bigger pointer target for the avatar beside it, which stays the
        // one control for the keyboard and for screen readers.
        <span
          aria-hidden="true"
          data-account-name
          className="min-w-0 flex-1 cursor-pointer truncate py-2 pr-2 group-data-[collapsible=icon]:hidden"
          onPointerDown={() => { openAtPress.current = trigger()?.getAttribute("aria-expanded") === "true"; }}
          onClick={() => { if (!openAtPress.current) trigger()?.click(); }}
        >
          {user?.fullName || user?.firstName || "Account"}
        </span>
      )}
      <Dialog open={confirming !== null} onOpenChange={(open) => { if (!open && !signingOut) { setConfirming(null); setSignOutError(null); } }}>
        <DialogContent
          showCloseButton={!signingOut}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            rootRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Sign out and remove saved trips?</DialogTitle>
            <DialogDescription>
              Signing out removes the {confirming === 1 ? "trip brief" : confirming ? `${confirming} trip briefs` : "trip briefs"} saved on this device for offline use.
              Your trips stay in your account, and you can save them again after you sign in.
            </DialogDescription>
          </DialogHeader>
          {signOutError && <p role="alert" className="text-base font-medium text-destructive">{signOutError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setConfirming(null); setSignOutError(null); }} disabled={signingOut}>Cancel</Button>
            <Button type="button" onClick={() => void finishSignOut()} aria-busy={signingOut || undefined} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out and remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
