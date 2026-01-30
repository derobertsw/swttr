"use client";

import { useState, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WeatherSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}

function WeatherSlider({ id, label, value, min, max, unit, onChange }: WeatherSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id}>
        {label}: {value}{unit}
      </label>
      <Slider
        id={id}
        min={min}
        max={max}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
      />
    </div>
  );
}

function useCurrentWeather(
  onTemperatureChange: (value: number) => void,
  onWindspeedChange: (value: number) => void
) {
  const [loading, setLoading] = useState(false);

  const fetchCurrentWeather = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/weather?lat=${latitude}&lon=${longitude}`
          );

          if (!response.ok) {
            throw new Error("Failed to fetch weather");
          }

          const data = await response.json();
          onTemperatureChange(data.temperature);
          onWindspeedChange(data.windSpeed);
          toast.success("Weather updated to current conditions");
        } catch (error) {
          toast.error("Failed to fetch weather data");
          console.error(error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("Location access denied. Please enable location access.");
        } else {
          toast.error("Unable to get your location");
        }
      }
    );
  }, [onTemperatureChange, onWindspeedChange]);

  return { loading, fetchCurrentWeather };
}

interface WeatherSelectionProps {
  temperature: number;
  windspeed: number;
  onTemperatureChange: (value: number) => void;
  onWindspeedChange: (value: number) => void;
  onPlanAhead: () => void;
}

export default function WeatherSelection({
  temperature,
  windspeed,
  onTemperatureChange,
  onWindspeedChange,
  onPlanAhead,
}: WeatherSelectionProps) {
  const { loading, fetchCurrentWeather } = useCurrentWeather(
    onTemperatureChange,
    onWindspeedChange
  );

  return (
    <div className="flex flex-col gap-6 w-[300px]">
      <WeatherSlider
        id="temperature"
        label="Temperature"
        value={temperature}
        min={-20}
        max={100}
        unit="°F"
        onChange={onTemperatureChange}
      />
      <WeatherSlider
        id="windspeed"
        label="Wind Speed"
        value={windspeed}
        min={0}
        max={50}
        unit=" mph"
        onChange={onWindspeedChange}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={fetchCurrentWeather}
          disabled={loading}
        >
          {loading ? "Loading..." : "Current Weather"}
        </Button>
        <Button variant="outline" onClick={onPlanAhead}>
          Plan Ahead
        </Button>
      </div>
    </div>
  );
}
