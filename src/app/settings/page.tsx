"use client";

import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemperatureSensitivitySelector } from "@/components/TemperatureSensitivitySelector";
import { useTemperatureSensitivity } from "@/hooks/useTemperatureSensitivity";

export default function Settings() {
  const { sensitivity, updateSensitivity, loading } = useTemperatureSensitivity();

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
            <CardTitle>Preferences</CardTitle>
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
      </div>
    </PageLayout>
  );
}
