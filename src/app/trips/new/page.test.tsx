import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeTripApi, reply, sentBodies, STOWE_PLACE, TRIP, tripFull } from "@/test/tripApi";
import { STORAGE_KEYS } from "@/lib/storage";
import NewTripPage from "./page";

let account = "user-1";
const replace = vi.fn();
const params = new URLSearchParams();
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: account, isLoaded: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), useSearchParams: () => params }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole("combobox", { name: "First destination" }), "Stowe");
  await user.click(await screen.findByRole("option", { name: /Stowe/ }));
  await user.type(screen.getByLabelText("Start date"), "2026-10-10");
  await user.type(screen.getByLabelText("End date"), "2026-10-12");
}

const routes = { "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }) };

describe("Single-form trip creation", () => {
  beforeEach(() => { vi.clearAllMocks(); account = "user-1"; sessionStorage.clear(); params.delete("trip"); params.delete("step"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("creates a solo trip with one destination and optional activity, then opens its stable overview", async () => {
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": reply(201, { trip: TRIP }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); render(<NewTripPage />);
    await fill(user);
    expect(screen.getByLabelText("Trip name")).toHaveValue("Stowe trip");
    await user.selectOptions(screen.getByLabelText("Default activity (optional)"), "Alpine");
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1"));
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toEqual([expect.objectContaining({ name: "Stowe trip", start_date: "2026-10-10", end_date: "2026-10-12", activity: "Alpine", creation_id: expect.any(String), destination: { name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69 } })]);
    expect(screen.getByRole("status")).toHaveTextContent("Your trip is saved");
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("members"))).toHaveLength(0);
  });

  it("keeps an edited suggested name when the destination changes", async () => {
    vi.stubGlobal("fetch", fakeTripApi(routes));
    const user = userEvent.setup(); render(<NewTripPage />); await fill(user);
    await user.clear(screen.getByLabelText("Trip name")); await user.type(screen.getByLabelText("Trip name"), "Our ski weekend");
    await user.clear(screen.getByRole("combobox", { name: "First destination" }));
    await user.type(screen.getByRole("combobox", { name: "First destination" }), "Stowe");
    await user.click(await screen.findByRole("option", { name: /Stowe/ }));
    expect(screen.getByLabelText("Trip name")).toHaveValue("Our ski weekend");
  });

  it("blocks double clicks and saves the request identity before sending", async () => {
    let finish = () => {};
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": () => new Promise((resolve) => { finish = () => resolve(reply(201, { trip: TRIP })); }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); render(<NewTripPage />); await fill(user);
    await user.dblClick(screen.getByRole("button", { name: "Create trip" }));
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(1);
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.TRIP_CREATION_DRAFT)!);
    expect(stored.draft.submitted).toEqual(sentBodies(fetchMock, "POST /api/v1/trips")[0]);
    expect(screen.getByLabelText("Trip name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Discard and start over" })).not.toBeInTheDocument();
    await act(async () => finish());
  });

  it("retains all input after failure and replays exactly the same request after reload", async () => {
    let attempts = 0;
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": () => ++attempts === 1 ? reply(500, { error: "Connection lost" }) : reply(200, { trip: TRIP, created: false }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); const page = render(<NewTripPage />); await fill(user);
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry checks the same draft");
    page.unmount(); render(<NewTripPage />);
    expect(await screen.findByLabelText("Trip name")).toHaveValue("Stowe trip");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-10-10");
    expect(screen.getByRole("combobox", { name: "First destination" })).toHaveValue("Stowe, Vermont, United States");
    await user.click(screen.getByRole("button", { name: "Retry create trip" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1"));
    const bodies = sentBodies(fetchMock, "POST /api/v1/trips"); expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  });

  it("allows correction after validation rejects before creating anything", async () => {
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": reply(400, { error: "Choose a shorter trip" }) }); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); render(<NewTripPage />); await fill(user); await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Edit the details and try again");
    expect(screen.getByLabelText("End date")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create trip" })).toBeEnabled();
  });

  it("replaces a rejected identity and preserves editable input across reload", async () => {
    let attempts = 0;
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": () => ++attempts === 1 ? reply(409, { error: "Draft identity unavailable. Start a new draft." }) : reply(201, { trip: TRIP }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const page = render(<NewTripPage />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A fresh draft is ready");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Retry checks the same draft");
    expect(screen.getByLabelText("Trip name")).toBeEnabled();
    const first = sentBodies(fetchMock, "POST /api/v1/trips")[0] as { creation_id: string };
    const restoredId = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.TRIP_CREATION_DRAFT)!).draft.id;
    expect(restoredId).not.toBe(first.creation_id);
    page.unmount(); render(<NewTripPage />);
    expect(await screen.findByLabelText("Trip name")).toHaveValue("Stowe trip");
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1"));
    expect(sentBodies(fetchMock, "POST /api/v1/trips")[1]).toEqual({ ...first, creation_id: restoredId });
  });

  it("lets the user discard an uncertain attempt after warning about an earlier save", async () => {
    let attempts = 0;
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": () => ++attempts === 1 ? reply(500, { error: "Unavailable" }) : reply(201, { trip: TRIP }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); const page = render(<NewTripPage />);
    await fill(user); await user.click(screen.getByRole("button", { name: "Create trip" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/An earlier attempt may already have saved a trip/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check your trips" })).toHaveAttribute("href", "/trips");
    await user.click(screen.getByRole("button", { name: "Discard and start over" }));
    expect(screen.getByLabelText("Trip name")).toHaveValue("");
    expect(screen.getByLabelText("Trip name")).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(1);
    page.unmount(); render(<NewTripPage />);
    await fill(user); await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1"));
    const bodies = sentBodies(fetchMock, "POST /api/v1/trips") as { creation_id: string }[];
    expect(bodies[1].creation_id).not.toBe(bodies[0].creation_id);
  });

  it("times out a stalled request and retains its identity for retry", async () => {
    const otherFetch = fakeTripApi(routes);
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => url === "/api/v1/trips" ? new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }) : otherFetch(url, init)));
    const user = userEvent.setup(); render(<NewTripPage />); await fill(user);
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Create trip" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(screen.getByRole("button", { name: "Retry create trip" })).toBeEnabled();
      expect(screen.getByRole("alert")).toHaveTextContent("Check your connection");
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.TRIP_CREATION_DRAFT)!).draft.submitted.creation_id).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it("recovers from malformed stored JSON", async () => {
    sessionStorage.setItem(STORAGE_KEYS.TRIP_CREATION_DRAFT, "broken{"); render(<NewTripPage />);
    expect(await screen.findByLabelText("Trip name")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("returns to a saved draft after Back without offering another create", async () => {
    const fetchMock = fakeTripApi({ ...routes, "POST /api/v1/trips": reply(201, { trip: TRIP }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); const page = render(<NewTripPage />); await fill(user); await user.click(screen.getByRole("button", { name: "Create trip" }));
    await screen.findByRole("link", { name: "Open saved trip" }); page.unmount(); render(<NewTripPage />);
    expect(await screen.findByRole("link", { name: "Open saved trip" })).toHaveAttribute("href", "/trips/trip-1");
    expect(screen.queryByRole("button", { name: "Create trip" })).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Start another trip" }));
    expect(screen.getByLabelText("Trip name")).toHaveValue("");
  });

  it("restores an unsubmitted draft's selected destination and dates", async () => {
    vi.stubGlobal("fetch", fakeTripApi(routes));
    const user = userEvent.setup(); const page = render(<NewTripPage />); await fill(user); page.unmount(); render(<NewTripPage />);
    expect(await screen.findByLabelText("End date")).toHaveValue("2026-10-12");
    expect(screen.getByRole("button", { name: "Create trip" })).toBeEnabled();
  });

  it("clears account-private input and ignores a late response across an account switch", async () => {
    let finish = () => {};
    vi.stubGlobal("fetch", fakeTripApi({ ...routes, "POST /api/v1/trips": () => new Promise((resolve) => { finish = () => resolve(reply(201, { trip: TRIP })); }) }));
    const user = userEvent.setup(); const page = render(<NewTripPage />); await fill(user); await user.click(screen.getByRole("button", { name: "Create trip" }));
    account = "user-2"; page.rerender(<NewTripPage />);
    await waitFor(() => expect(screen.getByLabelText("Trip name")).toHaveValue(""));
    account = "user-1"; page.rerender(<NewTripPage />);
    await act(async () => finish());
    expect(replace).not.toHaveBeenCalled(); expect(screen.getByLabelText("Trip name")).toHaveValue("");
    expect(sessionStorage.getItem(STORAGE_KEYS.TRIP_CREATION_DRAFT)).toBeNull();
  });

  it("doesn't issue a create when browser storage can't retain its identity", async () => {
    const fetchMock = fakeTripApi(routes); vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", { getItem: () => null, removeItem: vi.fn(), setItem: () => { throw new Error("Unavailable"); } });
    const user = userEvent.setup(); render(<NewTripPage />); await fill(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Browser storage is unavailable");
    expect(screen.getByRole("button", { name: "Create trip" })).toBeDisabled();
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(0);
  });

  it("resumes already-saved old wizard URLs without a new create", async () => {
    params.set("trip", "trip-1"); params.set("step", "3");
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }); vi.stubGlobal("fetch", fetchMock);
    render(<NewTripPage />); expect(await screen.findByRole("heading", { name: "Your crew" })).toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(0);
  });
});
