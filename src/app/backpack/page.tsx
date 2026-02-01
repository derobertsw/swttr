"use client";

import { useState, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITIES } from "@/data/backpackConstants";

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
  const [activity, setActivity] = useState("backcountry-skiing");
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
          <h2 className="text-2xl font-semibold">Backpack</h2>
          <p className="text-muted-foreground">
            Customize items to bring for each activity and temperature range.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <Select value={activity} onValueChange={setActivity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Activity" />
            </SelectTrigger>
            <SelectContent>
              {BACKPACK_ACTIVITIES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Temperature Range</label>
              <span className="text-sm text-muted-foreground">
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
            <div className="flex justify-between text-xs text-muted-foreground">
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
