"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TripMap, TripMapDay, TripMapPlace } from "@/types/trip-map";
import { Button } from "@/components/ui/button";
import { placeRoles, roleLabels, type MapDisplayRole } from "./trip-map-presentation";

type Props = {
  places: TripMapPlace[]; provider: TripMap["provider"]; scope: string; date: string;
  selectedId: string | null; fitRequest: number; onSelect: (id: string) => void;
  onGroup: (ids: string[]) => void; onError: () => void;
  /** The selected day, whose server references name each place's role that day. */
  day?: TripMapDay | null;
  /** Provider road geometry for the day's current origin/access pair; never a line of our own. */
  route?: number[][][] | null;
  /** Places the extent fits instead of all of them: the drive's origin and access point. */
  focusIds?: string[] | null;
};

function points(places: TripMapPlace[], date: string, day: TripMapDay | null = null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: "FeatureCollection", features: places.flatMap((place) => {
    if (!place.coordinates) return [];
    const roles = placeRoles(place, date, day);
    // A day names every role ("Starting from · Staying tonight"); the whole trip keeps the first.
    const label = day ? roles.map((role) => roleLabels[role]).join(" · ") : roleLabels[roles[0]];
    return [{
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [place.coordinates.longitude, place.coordinates.latitude] },
      properties: { id: place.id, role: roles[0], label, approximate: place.precision !== "exact" },
    }];
  }) };
}

const routeData = (route: number[][][] | null | undefined): GeoJSON.Feature<GeoJSON.MultiLineString> | GeoJSON.FeatureCollection => route
  ? { type: "Feature", geometry: { type: "MultiLineString", coordinates: route }, properties: {} }
  : { type: "FeatureCollection", features: [] };

function fit(map: LibreMap, places: TripMapPlace[]) {
  const coordinates = places.flatMap((place) => place.coordinates ? [[place.coordinates.longitude, place.coordinates.latitude] as [number, number]] : []);
  if (!coordinates.length) return;
  const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
  coordinates.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, { padding: 65, maxZoom: 12, duration: 0 });
}

/** Shapes are bundled pixels, independent of a provider's available glyphs. */
function roleImage(role: MapDisplayRole, primary: string, contrast: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = primary; ctx.strokeStyle = contrast; ctx.lineWidth = 4;
  ctx.beginPath();
  if (role === "stay" || role === "tonight") {
    ctx.moveTo(6, 22); ctx.lineTo(24, 6); ctx.lineTo(42, 22); ctx.lineTo(38, 22); ctx.lineTo(38, 42); ctx.lineTo(10, 42); ctx.lineTo(10, 22); ctx.closePath();
  } else if (role === "destination") {
    ctx.moveTo(24, 5); ctx.lineTo(43, 42); ctx.lineTo(5, 42); ctx.closePath();
  } else if (role === "access" || role === "meeting") {
    ctx.moveTo(24, 4); ctx.lineTo(44, 24); ctx.lineTo(24, 44); ctx.lineTo(4, 24); ctx.closePath();
  } else if (role === "pickup") ctx.rect(7, 7, 34, 34);
  else ctx.arc(24, 24, 18, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  return ctx.getImageData(0, 0, 48, 48);
}

export default function TripMapCanvas(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const [ready, setReady] = useState(false);
  const fitted = useRef("");

  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const fail = () => { if (!disposed) latest.current.onError(); };
    const timeout = window.setTimeout(fail, 20_000);
    try {
      // MapLibre 6 resolves its worker next to its entry file by default. A
      // bundler moves that entry; emit the matching worker as a local asset.
      maplibregl.setWorkerUrl(new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      map = new maplibregl.Map({
        container: container.current, style: props.provider.style_url, center: [0, 20], zoom: 1,
        attributionControl: false, cooperativeGestures: true, renderWorldCopies: false,
      });
      mapRef.current = map;
      // Keep phone scrolling available; rotation/pitch aren't itinerary tasks.
      map.dragRotate.disable(); map.touchZoomRotate.disableRotation();
      map.getCanvas().setAttribute("aria-label", "Trip places map. Use the place list for keyboard navigation.");
      map.getCanvas().setAttribute("tabindex", "-1");
      let loaded = false;
      // Tile/glyph/sprite failures can recover after the first successful load.
      map.on("error", () => { if (!loaded) fail(); });
      map.getCanvas().addEventListener("webglcontextlost", fail);
      map.on("load", () => {
        if (disposed) return;
        loaded = true;
        try {
          const primary = getComputedStyle(container.current!).getPropertyValue("--primary").trim() || "#743bea";
          const contrast = getComputedStyle(container.current!).getPropertyValue("--primary-foreground").trim() || "#ffffff";
          for (const role of ["stay", "tonight", "destination", "origin", "access", "meeting", "pickup"] as const) map.addImage(role, roleImage(role, primary, contrast), { pixelRatio: 2 });
          map.addSource("places", { type: "geojson", data: points(latest.current.places, latest.current.date), cluster: true, clusterRadius: 44, clusterMaxZoom: 18 });
          map.addLayer({ id: "groups", type: "circle", source: "places", filter: ["has", "point_count"], paint: { "circle-radius": 23, "circle-color": primary, "circle-stroke-color": contrast, "circle-stroke-width": 3 } });
          map.addLayer({ id: "counts", type: "symbol", source: "places", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 16, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": contrast } });
          map.addLayer({ id: "point-targets", type: "circle", source: "places", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 22, "circle-opacity": 0 } });
          map.addLayer({ id: "points", type: "symbol", source: "places", filter: ["!", ["has", "point_count"]], layout: {
            "icon-image": ["get", "role"], "icon-size": 1.2, "icon-allow-overlap": true,
            "text-field": ["concat", ["get", "label"], ["case", ["get", "approximate"], " · unconfirmed", ""]], "text-size": 12, "text-font": ["Noto Sans Regular"], "text-offset": [0, 2], "text-anchor": "top",
          }, paint: { "text-color": "#26351c", "text-halo-color": "#ffffff", "text-halo-width": 2, "icon-opacity": ["case", ["get", "approximate"], 0.65, 1] } });
          map.addSource("selection", { type: "geojson", data: points([], "") });
          map.addLayer({ id: "selection-ring", type: "circle", source: "selection", paint: { "circle-radius": 24, "circle-color": "#ffffff", "circle-stroke-color": "#17280b", "circle-stroke-width": 4 } });
          map.addLayer({ id: "selection-icon", type: "symbol", source: "selection", layout: { "icon-image": ["get", "role"], "icon-size": 1.3, "icon-allow-overlap": true } });
          map.on("click", "groups", async (event) => {
            const cluster = event.features?.[0]?.properties?.cluster_id;
            if (typeof cluster !== "number") return;
            const scope = latest.current.scope, places = latest.current.places;
            try {
              const leaves = await (map.getSource("places") as GeoJSONSource).getClusterLeaves(cluster, latest.current.places.length, 0);
              if (!disposed && latest.current.scope === scope && latest.current.places === places) latest.current.onGroup(leaves.flatMap((leaf) => typeof leaf.properties?.id === "string" ? [leaf.properties.id] : []));
            } catch { /* The scope may have changed while the worker resolved. */ }
          });
          map.on("click", "point-targets", (event) => {
            const feature = event.features?.[0];
            if (!feature || feature.geometry.type !== "Point") return;
            // At maximum zoom coincident entities still have individually named choices.
            // Rendered feature coordinates can be quantized by the worker.
            // Resolve canonical coordinates through the stable entity ID.
            const target = latest.current.places.find((place) => place.id === feature.properties?.id);
            if (!target?.coordinates) return;
            const { longitude, latitude } = target.coordinates;
            const hit = latest.current.places.filter((place) => place.coordinates?.longitude === longitude && place.coordinates?.latitude === latitude);
            if (hit.length > 1) latest.current.onGroup(hit.map((place) => place.id));
            else if (typeof feature.properties?.id === "string") latest.current.onSelect(feature.properties.id);
          });
          window.clearTimeout(timeout);
          setReady(true);
        } catch { fail(); }
      });
      resize = new ResizeObserver(() => map.resize());
      resize.observe(container.current);
    } catch { fail(); }
    return () => {
      disposed = true; window.clearTimeout(timeout); resize?.disconnect();
      mapRef.current = null;
      map?.remove();
    };
  }, [props.provider.style_url]);

  const focus = props.focusIds?.join(",") ?? "";
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("places") as GeoJSONSource).setData(points(props.places, props.date, props.day));
    const key = `${props.scope}:${props.fitRequest}:${focus}`;
    if (fitted.current !== key) {
      const focused = focus ? props.places.filter((place) => focus.split(",").includes(place.id)) : [];
      fit(map, focused.length ? focused : props.places);
      fitted.current = key;
    }
  }, [ready, props.places, props.scope, props.date, props.day, props.fitRequest, focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const selected = props.places.find((place) => place.id === props.selectedId);
    (map.getSource("selection") as GeoJSONSource).setData(points(selected ? [selected] : [], props.date, props.day));
  }, [ready, props.places, props.selectedId, props.date, props.day]);

  // The road layer exists only once real geometry arrives, beneath every marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource("route") as GeoJSONSource | undefined;
    if (source) { source.setData(routeData(props.route)); return; }
    if (!props.route) return;
    const primary = getComputedStyle(container.current!).getPropertyValue("--primary").trim() || "#743bea";
    map.addSource("route", { type: "geojson", data: routeData(props.route) });
    map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } }, "groups");
    map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": primary, "line-width": 4 } }, "groups");
  }, [ready, props.route]);

  return <div className="relative min-w-0">
    <div ref={container} className="h-[min(52dvh,420px)] min-h-64 w-full overflow-hidden rounded-card border border-border lg:h-[560px]" />
    {!ready && <p role="status" className="absolute left-3 top-3 rounded-control bg-card p-3 text-sm">Loading map… The list is ready.</p>}
    <div className="mt-2 flex flex-wrap gap-2" aria-label="Map controls">
      <Button type="button" variant="outline" disabled={!ready} onClick={() => mapRef.current?.zoomIn({ duration: 0 })} aria-label="Zoom in">+</Button>
      <Button type="button" variant="outline" disabled={!ready} onClick={() => mapRef.current?.zoomOut({ duration: 0 })} aria-label="Zoom out">−</Button>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Select a shape for details or a numbered group for its named places. Approximate and unconfirmed places have lighter markers.</p>
  </div>;
}
