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

export function DesktopActionDock() {
  const isNativeTabShell = useNativeTabShell();
  const pathname = usePathname();
  const { isLandingScreen, isTabActive } = useNavigationState(pathname);

  const renderDesktopTab = (item: TabItem) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "inline-flex h-10 min-w-[102px] items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors",
          isActive
            ? "border-white/45 bg-white/22 text-white shadow-[0_6px_14px_rgba(0,0,0,0.16)]"
            : "border-white/18 bg-transparent text-white/78 hover:bg-white/[0.12]"
        )}
      >
        <item.icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  };

  if (isNativeTabShell) {
    return null;
  }

  return (
    <nav
      className={cn(
        "pointer-events-none fixed bottom-3 z-50 hidden -translate-x-1/2 md:block xl:bottom-4",
        "left-[calc((100vw+var(--sidebar-width))/2)]",
        "peer-data-[state=collapsed]:left-[calc((100vw+var(--sidebar-width-icon))/2)]",
        isLandingScreen ? "text-white/90" : "text-white"
      )}
    >
      <div className="pointer-events-auto inline-flex max-w-[min(640px,calc(100vw-var(--sidebar-width)-2.25rem))] items-center gap-2 rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(54,86,116,0.8)_0%,rgba(38,86,108,0.78)_100%)] p-2 shadow-[0_18px_34px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        {TAB_ITEMS.map(renderDesktopTab)}
      </div>
    </nav>
  );
}
