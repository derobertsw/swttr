"use client";

import { useState, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITIES } from "@/data/backpackConstants";
import { FROSTED_INPUT } from "@/lib/styling";

// Convert slider values to temp range string
function toTempRange(min: number, max: number): string {
  if (max >= 40) {
    return "40+";
  }
  return `${min}-${max}`;
}

// Format temperature for display
function formatTemp(temp: number): string {
  if (temp >= 40) {
    return "40+°F";
  }
  return `${temp}°F`;
}

export default function Backpack() {
  const [activity, setActivity] = useState("backcountry_skiing");
  const [tempSlider, setTempSlider] = useState<number[]>([-20, 45]);

  const tempRange = useMemo(
    () => toTempRange(tempSlider[0], tempSlider[1]),
    [tempSlider]
  );

  const backpack = useBackpack(activity, tempRange);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold text-white/90 tracking-wide">Backpack</h2>
          <p className="text-[13px] text-white/55 mt-1">
            Customize items to bring for each activity and temperature range.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <Select value={activity} onValueChange={setActivity}>
            <SelectTrigger className={`h-12 w-full max-w-sm ${FROSTED_INPUT}`}>
              <SelectValue placeholder="Activity" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              {BACKPACK_ACTIVITIES.map((a) => (
                <SelectItem key={a.value} value={a.value} className="py-2.5">
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-col gap-3 mt-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-white/80">Temperature Range</label>
              <span className="text-sm text-white/60">
                {formatTemp(tempSlider[0])} to {formatTemp(tempSlider[1])}
              </span>
            </div>
            <Slider
              value={tempSlider}
              onValueChange={setTempSlider}
              min={-20}
              max={45}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/50">
              <span>-20°F</span>
              <span>40+°F</span>
            </div>
          </div>
        </div>

        <BackpackEditor
          items={backpack.items}
          onAddItem={backpack.addItem}
          onRemoveItem={backpack.removeItem}
          onHideDefault={backpack.hideDefault}
        />
      </div>
    </PageLayout>
  );
}
