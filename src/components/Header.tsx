"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Share2, HelpCircle, Menu, MessageSquare, Settings } from "lucide-react";
import { toast } from "sonner";
import { logWarn } from "@/lib/logger";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
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

const Header = ({ onLogoClick, variant = "default" }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
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
        <Link href="/" onClick={onLogoClick} className="md:hidden">
          <h1 className={cn("site-header", variant === "compact" && "site-header--compact")}>
            SWTTR
          </h1>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* Desktop: show UserButton or Sign In */}
        <div className="hidden md:flex items-center gap-4">
          <SignedIn>
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Link label="FAQ" labelIcon={<HelpCircle size={16} />} href="/faq" />
                <UserButton.Action label="Share" labelIcon={<Share2 size={16} />} onClick={handleShare} />
              </UserButton.MenuItems>
            </UserButton>
          </SignedIn>
          <SignedOut>
            <Link href="/sign-in" className="text-sm text-white/90 hover:text-white hover:underline">
              Sign In
            </Link>
          </SignedOut>
        </div>

        {/* Mobile: hamburger menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-full text-white/95 hover:bg-white/10",
                variant === "compact" ? "h-10 w-10" : "h-11 w-11"
              )}
            >
              <Menu className={cn("text-white/95", variant === "compact" ? "size-[18px]" : "size-5")} />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation and account options</SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-4 p-4">
              <SignedIn>
                <div className="flex items-center gap-3 pb-4 border-b">
                  <UserButton />
                  <span className="text-sm text-muted-foreground">Account</span>
                </div>
              </SignedIn>
              <SignedOut>
                <SheetClose asChild>
                  <Link
                    href="/sign-in"
                    className="flex items-center gap-3 text-sm font-medium hover:text-primary"
                  >
                    Sign In
                  </Link>
                </SheetClose>
              </SignedOut>
              <SheetClose asChild>
                <Link
                  href="/faq"
                  className="flex items-center gap-3 text-sm font-medium hover:text-primary"
                >
                  <HelpCircle className="size-4" />
                  FAQ
                </Link>
              </SheetClose>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm font-medium hover:text-primary"
              >
                <MessageSquare className="size-4" />
                Feedback
              </a>
              <button
                onClick={openPreferencesFromMenu}
                className="flex items-center gap-3 text-sm font-medium hover:text-primary text-left"
              >
                <Settings className="size-4" />
                Settings
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-3 text-sm font-medium hover:text-primary text-left"
              >
                <Share2 className="size-4" />
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
