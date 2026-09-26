"use client";

import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Loader2 } from "lucide-react";
import { ACTIVITIES } from "@/data/activities";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ACTIVITY_HEADER_LABELS: Record<string, string> = {
  running: "Running",
  biking: "Biking",
  hiking_snowshoeing: "Hiking",
  backcountry_skiing: "Backcountry",
  alpine_skiing: "Alpine",
  xc_skiing: "XC",
};

interface ActivityHeaderProps {
  activity?: string;
  onReset?: () => void;
  onActivityChange?: (activity: string) => Promise<void>;
  loading?: boolean;
}

/** Back button plus the current activity, switchable when onActivityChange is set. */
export function ActivityHeader({ activity, onReset, onActivityChange, loading }: ActivityHeaderProps) {
  const [open, setOpen] = useState(false);
  const selectedActivity = activity
    ? ACTIVITIES.find((candidate) => candidate.value === activity)
    : null;
  const label = selectedActivity
    ? (ACTIVITY_HEADER_LABELS[selectedActivity.value] ?? selectedActivity.name)
    : null;

  if (!onReset && !selectedActivity) return null;

  return (
    <div className="-mt-2 -mb-2 flex items-center justify-between gap-2">
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-sm font-medium text-white/75 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      ) : <span />}
      {selectedActivity && label && (
        onActivityChange ? (
          <Popover open={open} onOpenChange={(next) => { if (!loading) setOpen(next); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/[0.14]"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <selectedActivity.icon className="size-3.5" />}
                <span className="max-w-[7.25rem] truncate sm:max-w-none">{label}</span>
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end">
              {ACTIVITIES.map((act) => (
                <button
                  key={act.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-slate-100",
                    act.value === activity && "bg-slate-50 font-semibold"
                  )}
                  onClick={() => {
                    setOpen(false);
                    if (act.value !== activity) {
                      void onActivityChange(act.value);
                    }
                  }}
                >
                  <act.icon className="size-4 shrink-0 text-slate-500" />
                  <span className="flex-1 text-left">{act.name}</span>
                  {act.value === activity && <Check className="size-3.5 text-slate-500" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white/75">
            <selectedActivity.icon className="size-3.5" />
            <span className="max-w-[7.25rem] truncate sm:max-w-none">{label}</span>
          </span>
        )
      )}
    </div>
  );
}
