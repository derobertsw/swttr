"use client";

import { useState, useEffect } from "react";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemMappingEditor, useItemMappings } from "@/components/wardrobe";
import { BackpackEditor } from "@/components/BackpackEditor";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITIES, TEMP_RANGES } from "@/data/backpackConstants";

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
