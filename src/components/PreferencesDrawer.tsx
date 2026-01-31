"use client";

import {
  Drawer,
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
import { ReactNode } from "react";

const SENSITIVITY_OPTIONS: { value: TemperatureSensitivity; label: string; description: string }[] = [
  {
    value: "hot",
    label: "Run Hot",
    description: "Recommend lighter gear",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Standard recommendations",
  },
  {
    value: "cold",
    label: "Run Cold",
    description: "Recommend warmer gear",
  },
];

interface PreferencesDrawerProps {
  children: ReactNode;
  sensitivity: TemperatureSensitivity;
  defaultActivity: string;
  onSensitivityChange: (value: TemperatureSensitivity) => void;
  onDefaultActivityChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PreferencesDrawer({
  children,
  sensitivity,
  defaultActivity,
  onSensitivityChange,
  onDefaultActivityChange,
  open,
  onOpenChange,
}: PreferencesDrawerProps) {
  const selectedSensitivity = SENSITIVITY_OPTIONS.find((opt) => opt.value === sensitivity);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm pb-8">
          <DrawerHeader>
            <DrawerTitle>Preferences</DrawerTitle>
            <DrawerDescription>
              Customize your recommendations
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-6 px-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Default Activity</label>
              <Select value={defaultActivity} onValueChange={onDefaultActivityChange}>
                <SelectTrigger>
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
                This will be pre-selected when you open the app
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Temperature Sensitivity</label>
              <Select value={sensitivity} onValueChange={onSensitivityChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sensitivity" />
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSensitivity && (
                <p className="text-sm text-muted-foreground">
                  {selectedSensitivity.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
