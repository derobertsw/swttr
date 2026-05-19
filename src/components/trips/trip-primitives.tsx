"use client";

import { ReactNode } from "react";
import {
  CloudRain,
  CloudSnow,
  Cloud,
  Sun,
  Snowflake,
  CloudSun,
  Shirt,
  Footprints,
  Hand,
  Copy,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WEATHER_ICONS: Record<string, typeof Sun> = {
  snow: Snowflake,
  rain: CloudRain,
  cloud: Cloud,
  mix: CloudSnow,
  sun: Sun,
  partly: CloudSun,
};

export function WeatherGlyph({ kind, className }: { kind: string; className?: string }) {
  const Icon = WEATHER_ICONS[kind] ?? Cloud;
  return <Icon className={cn("size-5 text-white/80", className)} />;
}

const GARMENT_ICONS: Record<string, typeof Shirt> = {
  shirt: Shirt,
  midlayer: Shirt,
  jacket: Shirt,
  shell: Shirt,
  pants: Footprints,
  gloves: Hand,
};

export function GarmentGlyph({ kind, className }: { kind: string; className?: string }) {
  const Icon = GARMENT_ICONS[kind] ?? Shirt;
  return <Icon className={cn("size-4 text-white/72", className)} />;
}

export function MemberAvatar({
  name,
  highlighted = false,
  size = 32,
  state = "default",
}: {
  name: string;
  highlighted?: boolean;
  size?: number;
  state?: "default" | "guest" | "invited" | "self";
}) {
  const stateStyles = {
    default: "border-white/45 bg-white/12 text-white",
    guest: "border-white/30 bg-white/[0.06] text-white/70",
    invited: "border-dashed border-white/35 bg-transparent text-white/70",
    self: "border-cyan-300/60 bg-cyan-300/22 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase tracking-tight",
        highlighted && "ring-2 ring-cyan-300/50",
        stateStyles[state]
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function Chip({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "accent" | "warn" | "outline";
  className?: string;
}) {
  const styles = {
    default: "border-white/22 bg-white/10 text-white/85",
    accent: "border-cyan-300/50 bg-cyan-300/22 text-cyan-50",
    warn: "border-orange-300/45 bg-orange-300/18 text-orange-50",
    outline: "border-white/22 bg-transparent text-white/72",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  highlighted = false,
}: {
  children: ReactNode;
  className?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-slate-950/22 px-4 py-3.5 backdrop-blur-sm transition-colors",
        highlighted
          ? "border-cyan-300/55 bg-cyan-300/[0.08]"
          : "border-white/12 hover:border-white/20",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45",
        className
      )}
    >
      {children}
    </p>
  );
}

export function Spine({ color = "cyan" }: { color?: "cyan" | "emerald" | "amber" }) {
  const cls = {
    cyan: "bg-cyan-300/70",
    emerald: "bg-emerald-300/70",
    amber: "bg-amber-300/70",
  }[color];
  return <span className={cn("inline-block w-[3px] self-stretch rounded-full", cls)} />;
}

export function inferWeatherKind(tempF: number, precipFraction: number): string {
  if (precipFraction > 0.5) return tempF <= 32 ? "snow" : "rain";
  if (precipFraction > 0.1) return "mix";
  if (tempF <= 27) return "snow";
  if (tempF >= 59) return "sun";
  return "cloud";
}

export function formatDateRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  if (startISO === endISO) return fmt(startISO);
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}

export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

export function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") return `/trips/invite/${token}`;
  return `${window.location.origin}/trips/invite/${token}`;
}

export function InviteLinkButton({
  token,
  recipientName,
  tripName,
  className,
}: {
  token: string;
  recipientName: string;
  tripName?: string;
  className?: string;
}) {
  const handleShare = async () => {
    const url = buildInviteUrl(token);
    const shareData: ShareData = {
      title: tripName ? `${tripName} — trip invite` : "Trip invite",
      text: `${recipientName}, here's your invite to ${tripName ?? "the trip"}.`,
      url,
    };
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled — fall through to clipboard.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      // Final fallback — show the URL so the user can copy manually.
      window.prompt("Copy this invite link:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-cyan-300/45 bg-cyan-300/15 px-2.5 py-1.5 text-xs font-medium text-cyan-50 hover:bg-cyan-300/25",
        className
      )}
    >
      {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
        <Share2 className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      Send invite
    </button>
  );
}
