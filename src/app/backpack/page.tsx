"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITIES, TEMP_RANGES } from "@/data/backpackConstants";

export default function Backpack() {
  const [activity, setActivity] = useState("backcountry-skiing");
  const [tempRange, setTempRange] = useState("0-5");

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

        <Card>
          <CardHeader>
            <CardTitle>Items to Bring</CardTitle>
            <CardDescription>
              Select an activity and temperature to manage your backpack items.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4 flex-wrap">
              <Select value={activity} onValueChange={setActivity}>
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

              <Select value={tempRange} onValueChange={setTempRange}>
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
