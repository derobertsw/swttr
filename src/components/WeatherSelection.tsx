"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WeatherSelectionProps {
  temperature: number;
  windspeed: number;
  onTemperatureChange: (value: number) => void;
  onWindspeedChange: (value: number) => void;
}

const WeatherSelection = ({
  temperature,
  windspeed,
  onTemperatureChange,
  onWindspeedChange,
}: WeatherSelectionProps) => {
  const handleComingSoon = () => {
    toast("Coming Soon");
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
        <Button variant="outline" onClick={handleComingSoon}>
          Current Weather
        </Button>
        <Button variant="outline" onClick={handleComingSoon}>
          Plan Ahead
        </Button>
      </div>
    </div>
  );
};

export default WeatherSelection;
