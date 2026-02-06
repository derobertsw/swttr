"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Shirt, Backpack, Settings, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { ACTIVITIES } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";

const LEFT_ITEMS = [
  { href: "/?mode=planAhead", label: "Plan", icon: CalendarDays },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

const RIGHT_ITEMS = [
  { href: "/backpack", label: "Backpack", icon: Backpack },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isGearUpLoading, setIsGearUpLoading] = useState(false);
  const [activityValue, setActivityValue] = useState<string>("");
  const [isFabPulse, setIsFabPulse] = useState(false);
  const {
    sensitivity,
    defaultActivity,
    updateSensitivity,
    updateDefaultActivity,
  } = usePreferences();

  // On landing screen (home), no tab should have visual emphasis
  const isLandingScreen = pathname === "/";

  useEffect(() => {
    const onLoading = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setIsGearUpLoading(Boolean(detail));
    };
    window.addEventListener("gearUpLoading", onLoading);
    return () => window.removeEventListener("gearUpLoading", onLoading);
  }, []);

  useEffect(() => {
    if (pathname !== "/" && isGearUpLoading) {
      setIsGearUpLoading(false);
    }
  }, [pathname, isGearUpLoading]);

  useEffect(() => {
    if (activityValue) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY) : null;
    if (stored) {
      setActivityValue(stored);
      return;
    }
    if (defaultActivity) {
      setActivityValue(defaultActivity);
    }
  }, [activityValue, defaultActivity]);

  useEffect(() => {
    const onActivityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; value?: string }>).detail;
      const nextValue = detail?.value ?? "";
      setActivityValue(nextValue);
      setIsFabPulse(true);
      window.setTimeout(() => setIsFabPulse(false), 180);
    };
    window.addEventListener("activityChange", onActivityChange);
    return () => window.removeEventListener("activityChange", onActivityChange);
  }, []);

  const ActivityGlyph = useMemo(() => {
    const match = ACTIVITIES.find((item) => item.value === activityValue);
    return match?.icon ?? Zap;
  }, [activityValue]);

  const renderTab = (item: { href: string; label: string; icon: typeof CalendarDays }) => {
    const wouldBeActive = item.href.startsWith("/?") ? pathname === "/" : pathname === item.href;
    const isActive = isLandingScreen ? false : wouldBeActive;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex flex-col items-center gap-1.5 text-[11px] font-medium leading-none transition-all",
          isActive ? "text-white" : "text-white/55",
          isLandingScreen && "translate-y-0.5"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center size-9 rounded-full transition-all",
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
  };

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]",
        isLandingScreen ? "text-white/60" : "text-white/80"
      )}
      style={{ backgroundColor: "rgba(79, 157, 166, 0.45)" }}
    >
      <div className="relative h-16 backdrop-blur-lg">
        <div className="grid h-16 grid-cols-5 items-center px-3 pb-1">
          {LEFT_ITEMS.map(renderTab)}
          <div />
          {RIGHT_ITEMS.map(renderTab)}
          <PreferencesDrawer
            sensitivity={sensitivity}
            defaultActivity={defaultActivity}
            onSensitivityChange={updateSensitivity}
            onDefaultActivityChange={updateDefaultActivity}
          >
            <button className="flex flex-col items-center gap-1.5 text-[11px] font-medium leading-none transition-all text-white/55 translate-y-0.5">
              <div className="flex items-center justify-center size-9 rounded-full">
                <Settings className="size-5 opacity-65" />
              </div>
              <span className="opacity-65">Settings</span>
            </button>
          </PreferencesDrawer>
        </div>

        <button
          type="button"
          className={cn(
            "absolute left-1/2 top-0 flex h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.4)] transition-transform duration-200",
            isFabPulse && "scale-110"
          )}
          aria-label="Gear Up"
          onClick={() => {
            if (isGearUpLoading) return;
            if (pathname === "/") {
              window.dispatchEvent(new CustomEvent("gearUp"));
              return;
            }
            if (!navigator.geolocation) {
              router.push("/?gearUp=1&geoDenied=1");
              return;
            }
            setIsGearUpLoading(true);
            navigator.geolocation.getCurrentPosition(
              (position) => {
                sessionStorage.setItem(
                  "swttr-gearup-coords",
                  JSON.stringify({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                  })
                );
                router.push("/?gearUp=1");
              },
              () => {
                sessionStorage.removeItem("swttr-gearup-coords");
                router.push("/?gearUp=1&geoDenied=1");
              }
            );
          }}
          disabled={isGearUpLoading}
        >
          {isGearUpLoading ? <Loader2 className="size-6 animate-spin" /> : <ActivityGlyph className="size-6" />}
        </button>
        <span className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 text-[11px] font-semibold text-white">
          Gear Up
        </span>
      </div>
    </nav>
  );
}
