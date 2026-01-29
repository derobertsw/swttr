"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WeatherSelectionProps {
  temperature: number;
  windspeed: number;
  onTemperatureChange: (value: number) => void;
  onWindspeedChange: (value: number) => void;
  onPlanAhead: () => void;
}

const WeatherSelection = ({
  temperature,
  windspeed,
  onTemperatureChange,
  onWindspeedChange,
  onPlanAhead,
}: WeatherSelectionProps) => {
  const [loading, setLoading] = useState(false);

  const handleCurrentWeather = async () => {
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
  };

  const handlePlanAhead = () => {
    onPlanAhead();
  };

  return (
    <div className="flex flex-col gap-6 w-[300px]">
      <div className="flex flex-col gap-2">
        <label htmlFor="temperature">Temperature: {temperature}°F</label>
        <Slider
          id="temperature"
          min={-20}
          max={100}
          value={[temperature]}
          onValueChange={(value) => onTemperatureChange(value[0])}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="windspeed">Wind Speed: {windspeed} mph</label>
        <Slider
          id="windspeed"
          min={0}
          max={50}
          value={[windspeed]}
          onValueChange={(value) => onWindspeedChange(value[0])}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleCurrentWeather}
          disabled={loading}
        >
          {loading ? "Loading..." : "Current Weather"}
        </Button>
        <Button variant="outline" onClick={handlePlanAhead}>
          Plan Ahead
        </Button>
      </div>
    </div>
  );
};

export default WeatherSelection;
