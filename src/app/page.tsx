"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import WeatherSelection from "@/components/WeatherSelection";
import LayerDisplay from "@/components/LayerDisplay";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import layerRecommendations from "@/data/layerRecommendations.json";

interface LayerSet {
  base: string[];
  mid?: string[];
  outer: string[];
}

interface Recommendation {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
}

const getTempRange = (temp: number): string => {
  if (temp < -15) return "-20--15";
  if (temp < -10) return "-15--10";
  if (temp < -5) return "-10--5";
  if (temp < 0) return "-5-0";
  if (temp < 5) return "0-5";
  if (temp < 10) return "5-10";
  if (temp < 15) return "10-15";
  if (temp < 20) return "15-20";
  if (temp < 25) return "20-25";
  if (temp < 30) return "25-30";
  if (temp < 35) return "30-35";
  if (temp < 40) return "35-40";
  return "40+";
};

const Home = () => {
  const [activity, setActivity] = useState("");
  const [temperature, setTemperature] = useState(50);
  const [windspeed, setWindspeed] = useState(10);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );
  const [showResults, setShowResults] = useState(false);

  const handleSubmit = () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }

    const tempRange = getTempRange(temperature);
    const activityData =
      layerRecommendations[activity as keyof typeof layerRecommendations];

    if (activityData) {
      const layers = activityData[
        tempRange as keyof typeof activityData
      ] as Recommendation;
      setRecommendation(layers);
      setShowResults(true);
      console.log({ activity, temperature, tempRange, layers });
    }
  };

  return (
    <PageLayout>
      {!showResults ? (
        <>
          <ActivitySelection value={activity} onChange={setActivity} />
          <WeatherSelection
            temperature={temperature}
            windspeed={windspeed}
            onTemperatureChange={setTemperature}
            onWindspeedChange={setWindspeed}
          />
          <Button onClick={handleSubmit}>Gear Up</Button>
        </>
      ) : (
        <>
          <LayerDisplay recommendation={recommendation} />
          <Button variant="outline" onClick={() => setShowResults(false)}>
            Back
          </Button>
        </>
      )}
    </PageLayout>
  );
};

export default Home;
