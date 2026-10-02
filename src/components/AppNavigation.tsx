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
          "flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-control px-2 py-1 text-xs leading-none transition-colors",
          isActive
            ? "font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:text-foreground"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
            isActive && "bg-primary-soft text-primary"
          )}
        >
          <item.icon className="size-5" strokeWidth={isActive ? 2.25 : 2} />
        </div>
        <span>{item.label}</span>
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+0.4rem)] md:hidden"
    >
      <div className="flex h-16 items-center justify-around px-6">
        {PRIMARY_NAV_ITEMS.map(renderTab)}
      </div>
    </nav>
  );
}
