"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Share2, HelpCircle, Menu, MessageSquare, Settings } from "lucide-react";
import { toast } from "sonner";
import { logWarn } from "@/lib/logger";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onLogoClick?: () => void;
  variant?: "default" | "compact";
}

const MENU_ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-5 [&>svg]:text-muted-foreground";

const Header = ({ onLogoClick, variant = "default" }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  // The native shell has no web sidebar, so its menu and logo show at every width.
  const isNativeTabShell = useNativeTabShell();
  const mobileOnly = isNativeTabShell ? undefined : "md:hidden";
  const {
    sensitivity,
    defaultActivity,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
  } = usePreferences();

  const handleShare = async () => {
    const shareData = {
      title: "SWTTR",
      text: "Check out SWTTR - get clothing recommendations for outdoor activities!",
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          logWarn("Header.share", err);
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.url);
      toast.success("Link copied to clipboard!");
    }
  };

  const openPreferencesFromMenu = () => {
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      setPreferencesOpen(true);
    }, 120);
  };

  return (
    <header className={cn(
      "flex w-full items-center justify-between",
      variant === "compact" ? "gap-3" : "gap-4"
    )}>
      <div className="flex items-center gap-2">
        {/* Mobile: show logo */}
        <Link href="/" onClick={onLogoClick} className={cn("rounded-control", mobileOnly)}>
          <span
            className={cn(
              "block leading-none font-bold text-foreground",
              variant === "compact"
                ? "text-[2rem] tracking-[0.16em]"
                : "text-[2.5rem] tracking-[0.2em]"
            )}
          >
            SWTTR
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* Desktop: show UserButton or Sign In */}
        <div className={cn("hidden items-center gap-4", !isNativeTabShell && "md:flex")}>
          <SignedIn>
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Link label="FAQ" labelIcon={<HelpCircle size={16} />} href="/faq" />
                <UserButton.Action label="Share" labelIcon={<Share2 size={16} />} onClick={handleShare} />
              </UserButton.MenuItems>
            </UserButton>
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Sign In
            </Link>
          </SignedOut>
        </div>

        {/* Mobile: hamburger menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className={mobileOnly}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation and account options</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menu" className="flex flex-col gap-1 px-2 pb-4">
              <SignedIn>
                <div className="mb-2 flex items-center gap-3 border-b border-border px-3 pb-4">
                  <UserButton />
                  <span className="text-sm text-muted-foreground">Account</span>
                </div>
              </SignedIn>
              <SignedOut>
                <SheetClose asChild>
                  <Link
                    href="/sign-in"
                    className={MENU_ITEM_CLASS}
                  >
                    Sign In
                  </Link>
                </SheetClose>
              </SignedOut>
              <SheetClose asChild>
                <Link
                  href="/faq"
                  className={MENU_ITEM_CLASS}
                >
                  <HelpCircle />
                  FAQ
                </Link>
              </SheetClose>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor"
                target="_blank"
                rel="noopener noreferrer"
                className={MENU_ITEM_CLASS}
              >
                <MessageSquare />
                Feedback
              </a>
              <button
                onClick={openPreferencesFromMenu}
                className={MENU_ITEM_CLASS}
              >
                <Settings />
                Settings
              </button>
              <button
                onClick={handleShare}
                className={MENU_ITEM_CLASS}
              >
                <Share2 />
                Share
              </button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <PreferencesDrawer
        sensitivity={sensitivity}
        defaultActivity={defaultActivity}
        heightInches={bodyMetricsSelection.heightInches}
        weightLbs={bodyMetricsSelection.weightLbs}
        onSensitivityChange={updateSensitivity}
        onDefaultActivityChange={updateDefaultActivity}
        onBodyMetricsChange={updateBodyMetrics}
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
      />
    </header>
  );
};

export default Header;
