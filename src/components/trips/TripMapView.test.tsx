import { useSyncExternalStore } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { tripMapFixture } from "@/test/tripMap";
import type { TripMap } from "@/types/trip-map";
import { TripMapView } from "./TripMapView";

const canvas = vi.hoisted(() => ({ props: null as unknown as Record<string, unknown>, crash: false }));
vi.mock("next/navigation", () => ({ useSearchParams: () => {
  const search = useSyncExternalStore((cb) => { window.addEventListener("popstate", cb); return () => window.removeEventListener("popstate", cb); }, () => window.location.search);
  return new URLSearchParams(search);
} }));
vi.mock("next/dynamic", () => ({ default: () => function MockCanvas(props: Record<string, unknown>) {
  canvas.props = props;
  if (canvas.crash) throw new Error("SDK chunk failed");
  return <div aria-label="Test canvas"><button onClick={() => (props.onSelect as (id: string) => void)("stop:stop-stowe:destination")}>Choose destination marker</button><button onClick={() => (props.onGroup as (ids: string[]) => void)(["stop:stop-stowe:destination", "stop:stop-smuggs:destination"])}>Open coincident group</button><button onClick={() => (props.onError as () => void)()}>Fail tiles</button></div>;
} }));

const base = await tripMapFixture();
let data: TripMap;
const path = "/trips/trip-drive/map";
const nativePush = window.history.pushState.bind(window.history);
beforeEach(() => {
  data = structuredClone(base); canvas.crash = false;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  nativePush({}, "", path);
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => { nativePush(state, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const view = (canEdit = false) => render(<TripMapView data={data} canEdit={canEdit} />);

describe("Synchronized trip map and accessible list", () => {
  it("selects a marker and row through the same stable URL and preserves all repeat dates", async () => {
    window.history.replaceState({ __NA: true }, "");
    const user = userEvent.setup(); view();
    await user.click(screen.getByRole("button", { name: "Choose destination marker" }));
    expect(window.location.search).toBe("?place=stop%3Astop-stowe%3Adestination");
    expect(vi.mocked(window.history.pushState).mock.calls[0][0]).not.toHaveProperty("__NA");
    expect(screen.getByRole("heading", { name: /Destination · Stowe, Vermont/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Destination · Stowe, Vermont/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "List" }));
    const row = screen.getByRole("button", { name: /Destination · Stowe, Vermont/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveTextContent("2027-01-08 · 2027-01-09");
    await user.click(screen.getByRole("button", { name: /Village Inn/ }));
    expect(screen.getByRole("link", { name: "View stay" })).toHaveAttribute("href", "/trips/trip-drive#stay-stay-inn");
    expect(screen.getByRole("link", { name: "View day · 2027-01-10" })).toBeVisible();
  });

  it("retains missing and approximate places and every date, including an unmapped day", async () => {
    data.places[0].precision = "approximate";
    data.dates.push({ date: "2027-01-12", label: "Tue, Jan 12" });
    view(); const user = userEvent.setup();
    expect(screen.getByText(/5 of 6 places shown/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: /Village Inn/ })).toHaveTextContent("Location not set");
    expect(screen.getByRole("button", { name: /Stowe Motel/ })).toHaveTextContent("Approximate location");
    await user.selectOptions(screen.getByLabelText("Trip dates"), "2027-01-12");
    expect(screen.getByText("No places assigned to this day yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "View day" })).toHaveAttribute("href", "/trips/trip-drive/days/2027-01-12");
    expect(screen.queryByRole("link", { name: "Add destination" })).not.toBeInTheDocument();
  });

  it("opens individually named coincident places without filtering itinerary rows", async () => {
    view(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open coincident group" }));
    const group = screen.getByRole("region", { name: "Places in selected group" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    await user.click(within(group).getByRole("button", { name: /Smugglers/ }));
    expect(window.location.search).toContain("stop-smuggs");
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(within(screen.getByRole("list", { name: "Itinerary places" })).getAllByRole("button")).toHaveLength(data.places.length);
  });

  it("provides list recovery for SDK/tiles failure with permitted canonical edit links", async () => {
    view(true); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Fail tiles" }));
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use list" }));
    await user.click(screen.getByRole("button", { name: /Stowe, Vermont/ }));
    expect(screen.getByRole("link", { name: "Edit in trip plan" })).toHaveAttribute("href", "/trips/trip-drive/stops");
    expect(screen.getByRole("contentinfo", { name: "Map and place attribution" })).toBeVisible();
    expect(screen.getByRole("link", { name: "OpenFreeMap" })).toBeVisible();
  });

  it("catches an import/render failure without losing the list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); canvas.crash = true; view();
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use list" }));
    expect(screen.getByRole("list", { name: "Itinerary places" })).toBeVisible();
  });

  it("recovers offline and keeps list selection usable without requesting geolocation", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    view();
    expect(screen.getByRole("heading", { name: "Map needs a connection" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use list" }));
    await userEvent.click(screen.getByRole("button", { name: /Village Inn/ }));
    expect(screen.getByRole("heading", { name: /Village Inn/ })).toBeVisible();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event("online")));
  });

  it("restores a deep-linked date/place and scroll through history, and recovers removed IDs", async () => {
    nativePush({ "tripMapScroll:trip-drive": 187 }, "", `${path}?date=2027-01-10&place=stay%3Astay-inn%3Alocation&view=list`);
    const result = view();
    expect(screen.getByRole("heading", { name: /Village Inn/ })).toBeVisible();
    expect(screen.getByLabelText("Trip dates")).toHaveValue("2027-01-10");
    const pane = screen.getByRole("heading", { name: /Village Inn/ }).parentElement!.parentElement!;
    expect(pane.scrollTop).toBe(187);
    pane.scrollTop = 240; fireEvent.scroll(pane);
    expect(window.history.state["tripMapScroll:trip-drive"]).toBe(240);
    act(() => { nativePush({}, "", `${path}?date=removed&place=removed`); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByRole("alert")).toHaveTextContent("This day is no longer in the itinerary");
    await userEvent.click(screen.getByRole("button", { name: "Show all days" }));
    expect(screen.getByLabelText("Trip dates")).toHaveValue("");
    result.rerender(<TripMapView data={{ ...data, places: [] }} canEdit={false} />);
    expect(screen.getByText("Add a destination to see it on the map.")).toBeVisible();
  });

  it("uses the list from a deep link without mounting the SDK, and keyboard Skip map focuses it", async () => {
    nativePush({}, "", `${path}?view=list`); view();
    expect(screen.queryByLabelText("Test canvas")).not.toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip map" }); skip.focus();
    await userEvent.keyboard("{Enter}");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("heading", { name: "Place list" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Edit in trip plan" })).not.toBeInTheDocument();
  });
});
