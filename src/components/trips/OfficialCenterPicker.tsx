"use client";

import { useId, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";
import { errorMessage, timedTripRequest } from "@/lib/trip-requests";
import type { AvalancheCenter, AvalancheCenterDirectory } from "@/types/avalanche-centers";

type State =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; directory: AvalancheCenterDirectory };

const PLACE = { access_point: "access point", destination: "destination" } as const;

/**
 * Official avalanche forecast centers for the source editor (#211, PR 3): the
 * verified list, and suggestions for the day's place from Avalanche Canada's
 * forecast areas. Choosing one only fills in the source's name and link; the
 * organizer still checks it and saves. Nothing is chosen for them.
 */
export function OfficialCenterPicker({ tripId, date, onPick }: {
  tripId: string;
  date: string;
  onPick: (center: AvalancheCenter) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [chosen, setChosen] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const selectId = useId();

  const load = async () => {
    setState({ status: "loading" });
    try {
      const directory = await timedTripRequest<AvalancheCenterDirectory>(`/api/v1/trips/${tripId}/days/${date}/conditions/centers`, "GET");
      setState({ status: "ready", directory });
    } catch (err) { setState({ status: "error", message: errorMessage(err) }); }
  };
  const pick = (center: AvalancheCenter) => {
    setChosen(center.id);
    onPick(center);
    setAnnouncement(`Filled in ${center.name}. Check its map covers your route, then save the source.`);
  };

  if (state.status !== "ready") {
    return (
      <div className="min-w-0 space-y-1 text-base text-foreground">
        <Button type="button" variant="outline" loading={state.status === "loading"} onClick={() => void load()}>
          {state.status === "error" ? "Try loading official centers again" : "Choose an official center"}
        </Button>
        {state.status === "error" && <p role="alert" className="text-destructive">{state.message} You can still enter the source yourself.</p>}
        {state.status === "loading"
          ? <p role="status" className="text-sm text-muted-foreground">Loading official centers…</p>
          : <p className="text-sm text-muted-foreground">A checked list of avalanche.org&apos;s U.S. centers and Canada&apos;s forecasters, with a suggestion for this day when Avalanche Canada has one.</p>}
      </div>
    );
  }

  const { centers, suggestions, verified_on } = state.directory;
  const byId = new Map(centers.map((center) => [center.id, center]));
  const place = suggestions.point ? PLACE[suggestions.point] : "destination";
  const groups = [["United States", "US"], ["Canada", "CA"]] as const;
  return (
    <div className="min-w-0 space-y-3 text-base text-foreground">
      <div className="space-y-2">
        <p className="font-medium">Suggested for this day</p>
        {suggestions.status === "found" ? <>
          <ul className="space-y-2">
            {suggestions.items.map((item) => {
              const center = byId.get(item.center_id);
              if (!center) return null;
              return (
                <li key={`${item.center_id}:${item.area}`} className="space-y-1">
                  <p className="break-words">
                    Avalanche Canada&apos;s forecast areas put this day&apos;s {place} in {item.area ? `“${item.area}”` : "a combined forecast area"} today, forecast by {item.forecaster}.
                  </p>
                  <Button type="button" variant="outline" onClick={() => pick(center)}>Use {center.name}</Button>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">
            Checked {format(new Date(suggestions.checked_at!), "h:mm a")}. Forecast areas change through the season: check the map covers your route before you go.
          </p>
        </> : (
          <p className="text-muted-foreground">
            {suggestions.status === "none" ? `Avalanche Canada's forecast areas don't include this day's ${place} today, so there's no suggestion.`
              : suggestions.status === "no_location" ? "Add the day's destination or access point to get a suggestion."
              : "Suggestions aren't available right now. You can still choose a center from the list."}
          </p>
        )}
        <p className="text-sm text-muted-foreground">SWTTR doesn&apos;t suggest U.S. centers. Choose the one whose forecast map covers your route.</p>
      </div>
      <div className="min-w-0 space-y-1">
        <label htmlFor={selectId} className="block">Official center</label>
        <select id={selectId} value={chosen} className={fieldClassName} aria-describedby={`${selectId}-hint`}
          onChange={(event) => { const center = byId.get(event.target.value); if (center) pick(center); }}>
          <option value="">Choose a center</option>
          {groups.map(([label, country]) => (
            <optgroup key={country} label={label}>
              {centers.filter((center) => center.country === country).map((center) => (
                <option key={center.id} value={center.id}>{center.name} · {center.area}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p id={`${selectId}-hint`} className="text-sm text-muted-foreground">
          Fills in the name and link; you still save the source. Links checked {format(new Date(`${verified_on}T00:00:00`), "MMM d, yyyy")} against avalanche.org, Avalanche Canada, Parks Canada and Avalanche Québec.
        </p>
      </div>
      <p aria-live="polite" className="text-sm text-success">{announcement}</p>
    </div>
  );
}
