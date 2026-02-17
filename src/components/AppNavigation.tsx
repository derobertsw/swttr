"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Shirt, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";

const TAB_ITEMS = [
  { href: "/?mode=planAhead", label: "Plan", icon: CalendarDays },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

type TabItem = (typeof TAB_ITEMS)[number];

interface RouterLike {
  push: (href: string) => void;
}

function useNavigationState(pathname: string, router: RouterLike) {
  const [isGearUpLoading, setIsGearUpLoading] = useState(false);
  const [activityValue, setActivityValue] = useState<string>("");
  const [isFabPulse, setIsFabPulse] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);

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
    setActivityValue(DEFAULT_ACTIVITY);
  }, [activityValue]);

  useEffect(() => {
    const onActivityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; value?: string }>).detail;
      const nextValue = detail?.value ?? "";
      setActivityValue(nextValue);
      setIsFabPulse(true);
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = window.setTimeout(() => {
        setIsFabPulse(false);
      }, 180);
    };
    window.addEventListener("activityChange", onActivityChange);
    return () => {
      window.removeEventListener("activityChange", onActivityChange);
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const ActivityGlyph = useMemo(() => {
    const match = ACTIVITIES.find((item) => item.value === activityValue);
    return match?.icon ?? Zap;
  }, [activityValue]);

  const isTabActive = useCallback(
    (href: string) => (href.startsWith("/?") ? pathname === "/" : pathname === href),
    [pathname]
  );

  const onTabClick = useCallback(
    (item: TabItem, e: React.MouseEvent) => {
      if (item.href === "/?mode=planAhead") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
        if (pathname !== "/") {
          router.push(item.href);
        }
      }
    },
    [pathname, router]
  );

  const onGearUpClick = useCallback(() => {
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
  }, [isGearUpLoading, pathname, router]);

  return {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  };
}

export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  } = useNavigationState(pathname, router);

  const renderTab = (item: { href: string; label: string; icon: typeof CalendarDays }) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => onTabClick(item, e)}
        className={cn(
          "flex flex-col items-center gap-1 text-xs font-semibold leading-none tracking-wide transition-all",
          isActive ? "text-white" : "text-white/70",
          !isActive && isLandingScreen && "translate-y-0.5"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center size-9 rounded-full transition-all",
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

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]",
        isLandingScreen ? "text-white/60" : "text-white/80"
      )}
      style={{ backgroundColor: "rgba(45, 107, 116, 0.62)" }}
    >
      <div className="relative h-16 backdrop-blur-lg">
        <div className="flex h-16 items-center justify-around px-3 pb-1">
          {renderTab(TAB_ITEMS[0])}
          <div className="w-16" />
          {renderTab(TAB_ITEMS[1])}
        </div>

        <button
          type="button"
          className={cn(
            "absolute left-1/2 top-0 flex h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.4)] transition-transform duration-200",
            isFabPulse && "scale-110"
          )}
          aria-label="Gear Up"
          onClick={onGearUpClick}
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

export function DesktopActionDock() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  } = useNavigationState(pathname, router);

  const renderDesktopTab = (item: TabItem) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => onTabClick(item, e)}
        className={cn(
          "inline-flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors",
          isActive
            ? "border-white/45 bg-white/20 text-white"
            : "border-white/20 bg-white/[0.06] text-white/80 hover:bg-white/[0.14]"
        )}
      >
        <item.icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      className={cn(
        "pointer-events-none fixed bottom-6 z-50 hidden -translate-x-1/2 md:block",
        "left-[calc((100vw+var(--sidebar-width))/2)]",
        "peer-data-[state=collapsed]:left-[calc((100vw+var(--sidebar-width-icon))/2)]",
        isLandingScreen ? "text-white/90" : "text-white"
      )}
    >
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-[rgba(32,71,95,0.66)] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        {renderDesktopTab(TAB_ITEMS[0])}
        <button
          type="button"
          aria-label="Start recommendation"
          onClick={onGearUpClick}
          disabled={isGearUpLoading}
          className={cn(
            "inline-flex h-14 min-w-[218px] items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.4)] transition-transform duration-200 hover:bg-black/90",
            isFabPulse && "scale-[1.03]"
          )}
        >
          {isGearUpLoading ? <Loader2 className="size-5 animate-spin" /> : <ActivityGlyph className="size-5" />}
          <span className="tracking-wide">Gear Up</span>
        </button>
        {renderDesktopTab(TAB_ITEMS[1])}
      </div>
    </nav>
  );
}
