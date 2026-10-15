import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationPicker } from "./LocationPicker";
import type { TripLocation } from "@/types/trips";

const place = (label: string, extra: Partial<TripLocation> = {}): TripLocation => ({
  label, address: "Jay, VT 05859, United States of America", latitude: 44.94, longitude: -72.5, precision: "exact",
  time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: `id-${label}`, attribution: "© OpenStreetMap contributors", ...extra,
});
const HOTEL = place("Hotel Jay & Conference Center", { address: "830 Jay Peak Road, Jay, VT 05859, United States of America" });
const STATESIDE = place("Stateside Hotel & Base Lodge", { latitude: 44.95 });
const TOWN = place("Village of Lake Placid", { address: "NY, United States of America", precision: "approximate" });

type Reply = { status: number; body: unknown };
type Answer = Reply | Promise<Reply> | (() => Promise<Reply>);
let answers: Record<string, Answer>;
const fetchMock = vi.fn(async (url: string) => {
  const query = new URL(url, "http://localhost").searchParams.get("q") ?? "";
  const entry = answers[query] ?? { status: 200, body: { results: [] } };
  const answer = await (typeof entry === "function" ? entry() : entry);
  return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as Response;
});
const queries = () => fetchMock.mock.calls.map(([url]) => new URL(url, "http://localhost").searchParams.get("q"));

function Harness({ initial = null, initialQuery, onSaveLater }: { initial?: TripLocation | null; initialQuery?: string; onSaveLater?: (query: string) => void }) {
  const [value, setValue] = useState<TripLocation | null>(initial);
  return <form onSubmit={(event) => { event.preventDefault(); submitted(); }}>
    <LocationPicker tripId="trip-1" heading="Where is the stay?" exactTarget="the exact property" value={value}
      initialQuery={initialQuery} onChange={(next) => { changes(next); setValue(next); }} onSaveLater={onSaveLater} />
  </form>;
}
const changes = vi.fn();
const submitted = vi.fn();
const searchBox = () => screen.getByRole("combobox", { name: "Search name or address" });

describe("Precise location picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answers = { "Hotel Jay": { status: 200, body: { results: [HOTEL, STATESIDE] } } };
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("searches once after typing stops, then picks with the keyboard after a check", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Where is the stay?" })).toBeInTheDocument();
    await user.type(searchBox(), "Hotel Jay");
    expect(await screen.findByText("2 places found. Choose one to check it.")).toBeInTheDocument();
    expect(queries()).toEqual(["Hotel Jay"]);
    expect(screen.getByRole("link", { name: "Powered by Geoapify" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(searchBox()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);
    await user.keyboard("{Enter}");
    expect(submitted).not.toHaveBeenCalled();
    const check = screen.getByRole("region", { name: "Check this location" });
    expect(within(check).getByText("Stateside Hotel & Base Lodge")).toBeInTheDocument();
    expect(within(check).getByRole("link", { name: "Open map (new tab)" })).toHaveAttribute("href", "https://www.openstreetmap.org/?mlat=44.95&mlon=-72.5#map=17/44.95/-72.5");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Check this location" })).toHaveFocus());
    expect(changes).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use this location" }));
    expect(changes).toHaveBeenCalledWith(STATESIDE);
    expect(screen.getByText("Exact location")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Change location" })).toHaveFocus());
  });

  it("goes back to the same query and results without searching again", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(searchBox(), "Hotel Jay");
    await user.click(await screen.findByRole("option", { name: /Hotel Jay & Conference Center/ }));
    await user.click(screen.getByRole("button", { name: "Back to results" }));
    expect(searchBox()).toHaveValue("Hotel Jay");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    await waitFor(() => expect(searchBox()).toHaveFocus());
  });

  it("never lets a slow answer to an older query replace newer results", async () => {
    let finishOld = () => {};
    answers["Hotel"] = new Promise((resolve) => { finishOld = () => resolve({ status: 200, body: { results: [place("Old answer")] } }); });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(searchBox(), "Hotel");
    await waitFor(() => expect(queries()).toEqual(["Hotel"]));
    await user.type(searchBox(), " Jay");
    expect(await screen.findByRole("option", { name: /Hotel Jay & Conference Center/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Stateside/ }));
    await act(async () => finishOld());
    expect(screen.queryByText("Old answer")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Check this location" })).getByText("Stateside Hotel & Base Lodge")).toBeInTheDocument();
  });

  it("labels a town as approximate before and after it's chosen", async () => {
    answers["Lake Placid"] = { status: 200, body: { results: [TOWN] } };
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(searchBox(), "Lake Placid");
    expect(await screen.findByRole("option", { name: /Village of Lake Placid.*Approximate area/ })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("Approximate area — choose the exact property for drive times.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this location" }));
    expect(changes).toHaveBeenCalledWith(TOWN);
    expect(screen.getByText("Approximate area — choose the exact property for drive times.")).toBeInTheDocument();
  });

  it("tells no matches apart from search being unavailable, and keeps the text for later", async () => {
    answers["Nowhere Inn"] = { status: 200, body: { results: [] } };
    answers["Hotel Jay"] = { status: 503, body: { error: "Location search isn't available right now.", code: "unavailable" } };
    const saveLater = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSaveLater={saveLater} />);
    await user.type(searchBox(), "Nowhere Inn");
    expect(await screen.findByText(/^No matches\./)).toBeInTheDocument();
    await user.clear(searchBox());
    await user.type(searchBox(), "Hotel Jay");
    expect(await screen.findByText(/^Location search isn't available right now\. Save the address/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save location later" }));
    expect(saveLater).toHaveBeenCalledWith("Hotel Jay");
    expect(changes).not.toHaveBeenCalled();
  });

  it("explains a search limit and a dropped connection", async () => {
    answers["Hotel Jay"] = { status: 429, body: { error: "Too many searches. Wait a minute, then try again.", code: "rate_limited" } };
    answers["Hotel Jaye"] = () => Promise.reject(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(searchBox(), "Hotel Jay");
    expect(await screen.findByText(/^Too many searches\. Wait a minute, then try again\./)).toBeInTheDocument();
    await user.type(searchBox(), "e");
    expect(await screen.findByText(/^Location search isn't available right now\./)).toBeInTheDocument();
  });

  it("searches a saved address straight away when asked to set the location", async () => {
    render(<Harness initialQuery="Hotel Jay" />);
    expect(screen.getByText("Searching…")).toBeInTheDocument();
    expect(await screen.findAllByRole("option")).toHaveLength(2);
  });

  it("keeps the current place until a replacement is chosen, and removes it only on request", async () => {
    const user = userEvent.setup();
    render(<Harness initial={HOTEL} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change location" }));
    await user.type(searchBox(), "Hotel Jay");
    await user.click(await screen.findByRole("option", { name: /Stateside/ }));
    await user.click(screen.getByRole("button", { name: "Back to results" }));
    await user.click(screen.getByRole("button", { name: "Keep current location" }));
    expect(changes).not.toHaveBeenCalled();
    expect(screen.getByText("Hotel Jay & Conference Center")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove location" }));
    expect(changes).toHaveBeenCalledWith(null);
    await waitFor(() => expect(searchBox()).toHaveFocus());
  });

  it("takes typed coordinates, refusing 0, 0 and out-of-range values", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Enter coordinates" }));
    await user.type(screen.getByLabelText("Latitude"), "0");
    await user.type(screen.getByLabelText("Longitude"), "0");
    await user.click(screen.getByRole("button", { name: "Use these coordinates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("0, 0 isn't a usable location");
    expect(screen.getByLabelText("Latitude")).toHaveAttribute("aria-invalid", "true");
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "95");
    await user.click(screen.getByRole("button", { name: "Use these coordinates" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Latitude"));
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Latitude"), "44.4939123, -72.73918");
    await user.click(screen.getByRole("button", { name: "Use these coordinates" }));
    expect(changes).toHaveBeenCalledWith({ label: "Entered coordinates", address: "44.493912, -72.73918", latitude: 44.493912, longitude: -72.73918,
      precision: "exact", time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null });
    expect(screen.getByText("Exact location · entered coordinates")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Powered by Geoapify" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
