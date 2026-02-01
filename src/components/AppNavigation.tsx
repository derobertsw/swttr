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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
      <div className="flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href.startsWith("/?") ? pathname === "/" : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="size-5" />
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
            className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors text-muted-foreground"
          >
            <Settings className="size-5" />
            Preferences
          </button>
        </PreferencesDrawer>
      </div>
    </nav>
  );
}
