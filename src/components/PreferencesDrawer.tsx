"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TemperatureSensitivity } from "@/types/preferences";
import { ACTIVITIES } from "@/data/activities";
import { ReactNode, useEffect, useState } from "react";
import {
  MAX_HEIGHT_INCHES,
  MAX_WEIGHT_LBS,
  MIN_HEIGHT_INCHES,
  MIN_WEIGHT_LBS,
} from "@/lib/biophysics/bodyMetrics";
import { Check, Settings2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const SENSITIVITY_OPTIONS: { value: TemperatureSensitivity; label: string; description: string }[] = [
  {
    value: "hot",
    label: "Run Warm",
    description: "You run warm. We bias toward lighter layers.",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Balanced recommendations for most people.",
  },
  {
    value: "cold",
    label: "Run Cold",
    description: "You run cold. We bias toward warmer layers.",
  },
];

interface PreferencesDrawerProps {
  children?: ReactNode;
  sensitivity: TemperatureSensitivity;
  defaultActivity: string;
  heightInches?: number;
  weightLbs?: number;
  onSensitivityChange: (value: TemperatureSensitivity) => void | Promise<void>;
  onDefaultActivityChange: (value: string) => void | Promise<void>;
  onBodyMetricsChange: (metrics: { heightInches?: number; weightLbs?: number }) => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PreferencesDrawer({
  children,
  sensitivity,
  defaultActivity,
  heightInches,
  weightLbs,
  onSensitivityChange,
  onDefaultActivityChange,
  onBodyMetricsChange,
  open,
  onOpenChange,
}: PreferencesDrawerProps) {
  const selectedSensitivity = SENSITIVITY_OPTIONS.find((opt) => opt.value === sensitivity);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1400);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const runWithSaveState = async (fn: () => void | Promise<void>) => {
    setSaveState("saving");
    try {
      await fn();
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  };

  const heightOptions = Array.from(
    { length: MAX_HEIGHT_INCHES - MIN_HEIGHT_INCHES + 1 },
    (_, i) => MIN_HEIGHT_INCHES + i
  );
  const weightOptions = Array.from(
    { length: (MAX_WEIGHT_LBS - MIN_WEIGHT_LBS) / 5 + 1 },
    (_, i) => MIN_WEIGHT_LBS + (i * 5)
  );
  const formatHeight = (inches: number) => {
    const feet = Math.floor(inches / 12);
    const rem = inches % 12;
    return `${feet}'${rem}"`;
  };

  return (
      <Drawer open={open} onOpenChange={onOpenChange}>
      {children && <DrawerTrigger asChild>{children}</DrawerTrigger>}
      <DrawerContent className="max-h-[88vh]">
        <div className="mx-auto flex max-h-[88vh] w-full max-w-sm flex-col">
          <DrawerHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/95 pb-3 text-left backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>Preferences</DrawerTitle>
                <DrawerDescription>
                  Customize your recommendations
                </DrawerDescription>
                <p className="mt-1 text-xs text-muted-foreground/90">
                  Changes save automatically.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saveState === "saving" && (
                  <span className="text-xs font-medium text-muted-foreground">Saving...</span>
                )}
                {saveState === "saved" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <Check className="size-3.5" />
                    Saved
                  </span>
                )}
                <DrawerClose className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                  Done
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-10 pt-4">
            <section className="rounded-xl border border-border/70 bg-muted/[0.2] p-3.5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Settings2 className="size-3.5" />
                Recommendations
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Default Activity</label>
                <Select
                  value={defaultActivity}
                  onValueChange={(value) => runWithSaveState(() => onDefaultActivityChange(value))}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Select activity" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        <activity.icon className="size-4" />
                        {activity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Pre-selected each time you open SWTTR.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <label className="text-sm font-medium">Temperature Sensitivity</label>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label="Temperature sensitivity"
                >
                  {SENSITIVITY_OPTIONS.map((option) => {
                    const isSelected = option.value === sensitivity;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() =>
                          runWithSaveState(() => onSensitivityChange(option.value))
                        }
                        className={cn(
                          "rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background/80 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {selectedSensitivity && (
                  <p className="text-sm text-muted-foreground">
                    {selectedSensitivity.description}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-muted/[0.2] p-3.5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="size-3.5" />
                Body Profile
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Height (ft/in)</label>
                  <Select
                    value={heightInches !== undefined ? String(heightInches) : undefined}
                    onValueChange={(value) =>
                      runWithSaveState(() => onBodyMetricsChange({ heightInches: Number(value) }))
                    }
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Height" />
                    </SelectTrigger>
                    <SelectContent>
                      {heightOptions.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {formatHeight(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Weight (lb)</label>
                  <Select
                    value={weightLbs !== undefined ? String(weightLbs) : undefined}
                    onValueChange={(value) =>
                      runWithSaveState(() => onBodyMetricsChange({ weightLbs: Number(value) }))
                    }
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Weight" />
                    </SelectTrigger>
                    <SelectContent>
                      {weightOptions.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value} lb
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Used only for personalized thermal modeling.
              </p>
            </section>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
