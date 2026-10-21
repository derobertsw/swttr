import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TripMapView } from "@/components/trips/TripMapView";
import "@/assets/styles/globals.css";
import fixture from "./fixture.json";
import type { TripMap } from "@/types/trip-map";
const push = history.pushState.bind(history);
history.pushState = (state, unused, url) => { push(state, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); };
// A hand-drawn fictional line, standing in for the geometry API's provider answer.
const LINE = [[[-72.7262, 44.4875], [-72.74, 44.498], [-72.756, 44.51], [-72.77, 44.521], [-72.7816, 44.53]]];
let mode = new URLSearchParams(location.search).get("fixture") ?? "organizer";
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const match = url.pathname.match(/^\/api\/v1\/trips\/trip-drive\/days\/([\d-]+)\/geometry$/);
  if (!match) return realFetch(input, init);
  const day = (fixture as TripMap).days.find((entry) => entry.date === match[1])!;
  await new Promise((resolve) => setTimeout(resolve, 600));
  const base = { trip_id: "trip-drive", day_id: day.id, date: day.date, revision: url.searchParams.get("revision"), mode: "drive", origin_place_id: day.origin_place_id, access_place_id: day.access_place_id };
  const body = day.date === "2027-01-09" && mode !== "geometry-failure"
    ? { ...base, state: "available", geometry: { type: "MultiLineString", coordinates: LINE }, provider: "geoapify", calculated_at: new Date().toISOString(), attribution: [] }
    : { ...base, state: "unavailable", geometry: null };
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
};
function Preview() {
  const [current, setCurrent] = useState(mode);
  const data = structuredClone(fixture) as TripMap;
  if (current === "tiles-failure") data.provider.style_url = `${location.origin}/unavailable-style.json`;
  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 pb-24 text-foreground sm:p-8">
    <p className="text-sm text-muted-foreground">Fictional QA fixture · Production map/list/day components · Stubbed geometry · No saved trip data</p>
    <label className="text-base">Fixture <select className="min-h-11 max-w-full rounded border p-2" value={current} onChange={(event) => { mode = event.target.value; setCurrent(mode); }}>
      <option value="organizer">Organizer</option><option value="member">Member</option><option value="geometry-failure">Route line unavailable</option><option value="tiles-failure">Tile/style failure</option>
    </select></label>
    <p className="text-sm text-muted-foreground">Day plan · Map</p>
    <h1 className="text-title font-semibold wrap-anywhere">Vermont</h1>
    <TripMapView key={current} data={data} canEdit={current !== "member"} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
