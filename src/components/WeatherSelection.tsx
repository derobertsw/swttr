"use client";

import React from "react";

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
  return (
    <div>
      <div>
        <label htmlFor="temperature">Temperature: {temperature}°F</label>
        <input
          type="range"
          id="temperature"
          min={-20}
          max={100}
          value={temperature}
          onChange={(e) => onTemperatureChange(Number(e.target.value))}
        />
      </div>
      <div>
        <label htmlFor="windspeed">Wind Speed: {windspeed} mph</label>
        <input
          type="range"
          id="windspeed"
          min={0}
          max={50}
          value={windspeed}
          onChange={(e) => onWindspeedChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

export default WeatherSelection;
