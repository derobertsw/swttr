"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemperatureSensitivitySelector } from "@/components/TemperatureSensitivitySelector";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useTemperatureSensitivity } from "@/hooks/useTemperatureSensitivity";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITIES, TEMP_RANGES } from "@/data/backpackConstants";

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
