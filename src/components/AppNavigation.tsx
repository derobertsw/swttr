"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Shirt, Backpack, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";

const NAV_ITEMS = [
  { href: "/?mode=planAhead", label: "Plan", icon: CalendarDays },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/backpack", label: "Backpack", icon: Backpack },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const {
    sensitivity,
    defaultActivity,
    updateSensitivity,
    updateDefaultActivity,
  } = usePreferences();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ backgroundColor: '#4f9da6', boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)' }}>
      <div className="flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href.startsWith("/?") ? pathname === "/" : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 text-xs font-medium transition-all",
                isActive ? "text-primary" : "text-foreground/60"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center size-10 rounded-full transition-all",
                  isActive && "bg-primary/15 shadow-sm"
                )}
              >
                <item.icon
                  className="size-5"
                  fill={isActive ? "currentColor" : "none"}
                  strokeWidth={isActive ? 1.5 : 2}
                />
              </div>
              {item.label}
            </Link>
          );
        })}

        {/* Preferences as drawer trigger */}
        <PreferencesDrawer
          sensitivity={sensitivity}
          defaultActivity={defaultActivity}
          onSensitivityChange={updateSensitivity}
          onDefaultActivityChange={updateDefaultActivity}
        >
          <button
            className="flex flex-col items-center gap-1 text-xs font-medium transition-all text-foreground/60"
          >
            <div className="flex items-center justify-center size-10 rounded-full">
              <Settings className="size-5" />
            </div>
            Preferences
          </button>
        </PreferencesDrawer>
      </div>
    </nav>
  );
}
