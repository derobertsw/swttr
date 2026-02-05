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

  // On landing screen (home), no tab should have visual emphasis
  const isLandingScreen = pathname === "/";

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: 'rgba(79, 157, 166, 0.45)' }}
    >
      <div className="flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          // Determine if this item would normally be active
          const wouldBeActive = item.href.startsWith("/?") ? pathname === "/" : pathname === item.href;
          // On landing screen, suppress active styling so no tab competes for attention
          const isActive = isLandingScreen ? false : wouldBeActive;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 text-xs font-medium transition-all",
                isActive ? "text-white" : "text-white/65"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center size-10 rounded-full transition-all",
                  isActive && "bg-white/15"
                )}
              >
                <item.icon
                  className={cn("size-5", !isActive && "opacity-65")}
                  fill={isActive ? "currentColor" : "none"}
                  strokeWidth={isActive ? 1.5 : 2}
                />
              </div>
              <span className={cn(!isActive && "opacity-65")}>{item.label}</span>
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
            className="flex flex-col items-center gap-1 text-xs font-medium transition-all text-white/65"
          >
            <div className="flex items-center justify-center size-10 rounded-full">
              <Settings className="size-5 opacity-65" />
            </div>
            <span className="opacity-65">Preferences</span>
          </button>
        </PreferencesDrawer>
      </div>
    </nav>
  );
}
