"use client";

import { useState, useEffect } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemMappingEditor, useItemMappings } from "@/components/wardrobe";
import { BackpackEditor } from "@/components/BackpackEditor";
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

export default function Wardrobe() {
  const [userId, setUserId] = useState<string | null>(null);
  const { mappings, loading, updateMapping, deleteMapping } = useItemMappings(userId);
  const [backpackActivity, setBackpackActivity] = useState("backcountry-skiing");
  const [backpackTempRange, setBackpackTempRange] = useState("0-5");

  const backpack = useBackpack(backpackActivity, backpackTempRange);

  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold">My Gear</h2>
          <p className="text-muted-foreground">
            Replace standard layer names with your actual gear. These names will appear in your recommendations.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <ItemMappingEditor
            userId={userId}
            mappings={mappings}
            onUpdate={updateMapping}
            onDelete={deleteMapping}
          />
        )}

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
