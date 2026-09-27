"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";

const TAB_ITEMS = [
  { href: "/trips", label: "Trips", icon: Map },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

type TabItem = (typeof TAB_ITEMS)[number];

function useNavigationState(pathname: string) {
  const isLandingScreen = pathname === "/";

  const isTabActive = useCallback(
    (href: string) =>
      href === "/trips" ? pathname.startsWith("/trips") : pathname === href,
    [pathname]
  );

  return { isLandingScreen, isTabActive };
}

export function MobileTabBar() {
  const isNativeTabShell = useNativeTabShell();
  const pathname = usePathname();
  const { isLandingScreen, isTabActive } = useNavigationState(pathname);

  const renderTab = (item: TabItem) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-1 text-[11px] font-medium leading-none tracking-[0.01em] transition-colors",
          isActive ? "text-white" : "text-white/70",
          !isActive && isLandingScreen && "translate-y-0.5"
        )}
      >
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-all",
            isActive ? "bg-white/22 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-transparent"
          )}
        >
          <item.icon
            className={cn("size-5", !isActive && "opacity-80")}
            fill={isActive ? "currentColor" : "none"}
            strokeWidth={isActive ? 1.5 : 2}
          />
        </div>
        <span className={cn(!isActive && "opacity-80")}>{item.label}</span>
      </Link>
    );
  };

  if (isNativeTabShell) {
    return null;
  }

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[calc(env(safe-area-inset-bottom)+0.4rem)]",
        isLandingScreen ? "text-white/60" : "text-white/80"
      )}
    >
      <div className="h-[64px] border-t border-white/20 bg-[rgba(17,45,62,0.74)] backdrop-blur-2xl">
        <div className="flex h-full items-center justify-around px-6 pb-1 pt-1.5">
          {TAB_ITEMS.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}
