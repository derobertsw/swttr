"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Map, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";

// The app's three destinations, in order. The desktop sidebar and the mobile
// tab bar both render this list; Settings, Help and Account stay secondary.
export const PRIMARY_NAV_ITEMS = [
  { href: "/", label: "Gear up", icon: Layers },
  { href: "/trips", label: "Trips", icon: Map },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

type NavItem = (typeof PRIMARY_NAV_ITEMS)[number];

// Gear up owns only "/" (its query-string modes included); the others own
// their nested routes, so /trips/abc/days/2026-01-02 still highlights Trips.
export function isNavItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar() {
  const isNativeTabShell = useNativeTabShell();
  const pathname = usePathname();

  const renderTab = (item: NavItem) => {
    const isActive = isNavItemActive(item.href, pathname);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium leading-none tracking-[0.01em] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
          isActive ? "text-white" : "text-white/70"
        )}
      >
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-all motion-reduce:transition-none",
            isActive ? "bg-white/22 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-transparent"
          )}
        >
          <item.icon
            className={cn("size-5", !isActive && "opacity-80")}
            strokeWidth={isActive ? 2.25 : 2}
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
      aria-label="Primary"
      data-mobile-tab-bar
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] text-white/80"
    >
      <div className="h-[64px] border-t border-white/20 bg-[rgba(17,45,62,0.74)] backdrop-blur-2xl">
        <div className="flex h-full items-center justify-around px-6 pb-1 pt-1.5">
          {PRIMARY_NAV_ITEMS.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}
