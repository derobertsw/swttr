import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TripMapView } from "@/components/trips/TripMapView";
import "@/assets/styles/globals.css";
import fixture from "./fixture.json";
import type { TripMap } from "@/types/trip-map";
const push = history.pushState.bind(history);
history.pushState = (state, unused, url) => { push(state, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); };
function Preview() {
  const [mode, setMode] = useState("organizer");
  const data = structuredClone(fixture) as TripMap;
  if (mode === "tiles-failure") data.provider.style_url = `${location.origin}/unavailable-style.json`;
  if (mode === "empty") data.places = [];
  if (mode === "missing") data.places = data.places.map((place) => ({ ...place, coordinates: null, mapping: "missing_coordinates" }));
  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 pb-24 text-foreground sm:p-8">
    <p className="text-sm text-muted-foreground">Fictional QA fixture · Shared production map/list components · No saved trip data</p>
    <label className="text-base">Fixture <select className="min-h-11 max-w-full rounded border p-2" value={mode} onChange={(event) => setMode(event.target.value)}><option value="organizer">Organizer / long names / incomplete</option><option value="member">Member</option><option value="tiles-failure">Tile/style failure</option><option value="empty">Empty itinerary</option><option value="missing">All locations missing</option></select></label>
    <p className="text-sm text-muted-foreground">Overview · Places</p>
    <h1 className="text-title font-semibold wrap-anywhere">Green Mountain hut-to-hut weekend with the northern crew</h1>
    <TripMapView key={mode} data={data} canEdit={mode !== "member"} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
