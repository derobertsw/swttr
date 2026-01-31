"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Share2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface HeaderProps {
  onLogoClick?: () => void;
}

const Header = ({ onLogoClick }: HeaderProps) => {
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
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.url);
      toast.success("Link copied to clipboard!");
    }
  };

  return (
    <header className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {/* Desktop sidebar toggle */}
        <SidebarTrigger className="hidden md:flex" />

        {/* Mobile: show logo */}
        <Link href="/" onClick={onLogoClick} className="md:hidden">
          <h1 className="site-header">SWTTR</h1>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <SignedIn>
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link label="FAQ" labelIcon={<HelpCircle size={16} />} href="/faq" />
              <UserButton.Action label="Share" labelIcon={<Share2 size={16} />} onClick={handleShare} />
            </UserButton.MenuItems>
          </UserButton>
        </SignedIn>
        <SignedOut>
          <Link href="/sign-in" className="text-sm hover:underline">
            Sign In
          </Link>
        </SignedOut>
      </div>
    </header>
  );
};

export default Header;
