"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemperatureSensitivitySelector } from "@/components/TemperatureSensitivitySelector";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useTemperatureSensitivity } from "@/hooks/useTemperatureSensitivity";
import { useBackpack } from "@/hooks/useBackpack";

const BACKPACK_ACTIVITIES = [
  { value: "backcountry-skiing", label: "Backcountry Skiing" },
  { value: "xc-skiing", label: "XC Skiing" },
];

const TEMP_RANGES = [
  { value: "-20--15", label: "-20 to -15°F" },
  { value: "-15--10", label: "-15 to -10°F" },
  { value: "-10--5", label: "-10 to -5°F" },
  { value: "-5-0", label: "-5 to 0°F" },
  { value: "0-5", label: "0 to 5°F" },
  { value: "5-10", label: "5 to 10°F" },
  { value: "10-15", label: "10 to 15°F" },
  { value: "15-20", label: "15 to 20°F" },
  { value: "20-25", label: "20 to 25°F" },
  { value: "25-30", label: "25 to 30°F" },
  { value: "30-35", label: "30 to 35°F" },
  { value: "35-40", label: "35 to 40°F" },
  { value: "40+", label: "40°F+" },
];

export default function Settings() {
  const { sensitivity, updateSensitivity, loading } = useTemperatureSensitivity();
  const [backpackActivity, setBackpackActivity] = useState("backcountry-skiing");
  const [backpackTempRange, setBackpackTempRange] = useState("0-5");

  const backpack = useBackpack(backpackActivity, backpackTempRange);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold">Preferences</h2>
          <p className="text-muted-foreground">
            Customize how recommendations are calculated for you.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Temperature Sensitivity</CardTitle>
            <CardDescription>
              Adjust settings to match your personal comfort levels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TemperatureSensitivitySelector
              value={sensitivity}
              onChange={updateSensitivity}
              disabled={loading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backpack</CardTitle>
            <CardDescription>
              Customize items to bring for each activity and temperature range.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4">
              <Select value={backpackActivity} onValueChange={setBackpackActivity}>
                <SelectTrigger className="w-[180px]">
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

              <Select value={backpackTempRange} onValueChange={setBackpackTempRange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Temperature" />
                </SelectTrigger>
                <SelectContent>
                  {TEMP_RANGES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <BackpackEditor
              items={backpack.items}
              onAddItem={backpack.addItem}
              onRemoveItem={backpack.removeItem}
              onHideDefault={backpack.hideDefault}
            />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
