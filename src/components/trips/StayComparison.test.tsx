import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayComparison } from "./StayComparison";
import type { DriveLeg } from "@/lib/locations/routing";
import { stayWindowChoices, summarizeCandidate } from "@/lib/trip-stay-candidates";
import { compareStays, parseComparisonRequest } from "@/lib/trip-stay-comparison";
import { previewLodgingChange } from "@/lib/trip-lodging-changes";
import { place, splitDriveTrip } from "@/test/driveTrip";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, PINE, SPLIT_MEMBERS, SPLIT_TRIP, splitRows, SUN } from "@/test/splitStays";
import type { TripFull, TripLocation, TripStayCandidate, TripStayCandidates, TripStayUsePreview } from "@/types/trips";

const A = "3c000000-0000-4000-8000-000000000001", B = "3c000000-0000-4000-8000-000000000002";
const LONG = "The Very Long Name Of A Mountainside Chalet With Hot Tub, Sauna And A Ski-In Ski-Out Boot Room Near The Gondola Base";
const candidate = (id: string, name: string, location: TripLocation | null, extra: Partial<TripStayCandidate> = {}) => summarizeCandidate(SPLIT_TRIP, {
  id, trip_id: SPLIT_TRIP.id, name, check_in: FRI, check_out: SUN, address: null, property_url: `https://example.com/${id}`, notes: null, location,
  cost_amount: null, cost_currency: null, revision: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
});
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const matrix = async (sources: Array<{ latitude: number }>, targets: unknown[]) =>
  sources.map((source): Array<DriveLeg | null> => targets.map(() => ({ seconds: source.latitude === RIDGE.latitude ? 600 : 1500, meters: 9_000 })));
const listOf = (candidates: TripStayCandidate[], available = true): TripStayCandidates => ({ available, candidates, ...stayWindowChoices(SPLIT_TRIP) });

const base = `/api/v1/trips/${SPLIT_TRIP.id}/stay-candidates`;
type Reply = { status: number; body: unknown };
/** The trip's API: options, saves and comparisons worked out by the server's own code. */
function fakeApi(full: TripFull, state: { candidates: TripStayCandidate[]; available?: boolean }, writes: Partial<Record<string, (body: unknown) => Reply | Promise<Reply>>> = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0];
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    let reply: Reply;
    if (method === "GET" && path === base) reply = { status: 200, body: listOf(state.candidates, state.available) };
    else if (method === "GET" && path === `${base}/compare`) {
      const parsed = parseComparisonRequest(new URL(url, "http://localhost").searchParams, full.trip);
      if ("error" in parsed) reply = { status: 400, body: parsed };
      else {
        const result = await compareStays(full, state.candidates, parsed, { read: async () => [], write: async () => {}, manual: async () => [] }, { now: Date.parse("2026-10-05T15:00:00Z"), matrix });
        reply = "error" in result ? { status: result.status, body: result } : { status: 200, body: result };
      }
    } else {
      const handler = writes[`${method} ${path}`];
      if (!handler) throw new Error(`Unexpected request: ${method} ${url}`);
      reply = await handler(body);
    }
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
  });
}
const compareCalls = (api: ReturnType<typeof fakeApi>) => api.mock.calls.filter(([url]) => url.split("?")[0] === `${base}/compare`).map(([url]) => new URL(url, "http://localhost").searchParams);

async function renderPage({ full = splitDriveTrip(), candidates = [candidate(A, "Ridge chalet", RIDGE), candidate(B, "Brook inn", null)], canEdit = true,
  initial = { options: [] as string[], first_night: null as string | null, checkout: null as string | null }, writes = {}, available = true } = {}) {
  const state = { candidates, available };
  const api = fakeApi(full, state, writes);
  vi.stubGlobal("fetch", api);
  const onPlanSaved = vi.fn().mockResolvedValue(undefined);
  let view: ReturnType<typeof render> | undefined;
  await act(async () => { view = render(<StayComparison data={full} canEdit={canEdit} initial={initial} onPlanSaved={onPlanSaved} />); });
  const rerender = (next: TripFull) => act(async () => { view!.rerender(<StayComparison data={next} canEdit={canEdit} initial={initial} onPlanSaved={onPlanSaved} />); });
  return { api, state, onPlanSaved, rerender, user: userEvent.setup() };
}

describe("Compare stays (#213)", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/trips/trip-1/stays/compare"); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("explains what a comparison needs with fewer than two stays, and offers to add another", async () => {
    const one = splitDriveTrip();
    const full: TripFull = { ...one, lodging: { ...one.lodging!, stays: one.lodging!.stays.slice(0, 1) } };
    const { api } = await renderPage({ full, candidates: [] });
    expect(await screen.findByText("Choose two or three stays to compare.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add another stay" })).toBeInTheDocument();
    expect(compareCalls(api)).toEqual([]);
  });

  it("tells a member the organizer adds options", async () => {
    const one = splitDriveTrip();
    await renderPage({ full: { ...one, lodging: { ...one.lodging!, stays: [] } }, candidates: [candidate(A, "Ridge chalet", RIDGE)], canEdit: false });
    expect(await screen.findByText("The organizer can add stays to compare.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Ridge chalet" })).not.toBeInTheDocument();
  });

  it("compares chosen stays in the order chosen, each value named beneath its day, and keeps the choice in the address", async () => {
    const { api, user } = await renderPage();
    await user.click(await screen.findByRole("checkbox", { name: /Ridge chalet/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Pine rental/ }));
    expect(screen.getByRole("checkbox", { name: /Ridge chalet · First in the comparison/ })).toBeChecked();
    const [table] = await screen.findAllByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      expect.stringMatching(/^Ridge chalet/), expect.stringMatching(/^Pine rental/)]);
    expect(compareCalls(api).at(-1)?.get("options")).toBe(`candidate:${A},stay:${PINE.id}`);
    expect(window.location.search).toBe(`?options=candidate%3A${A}%2Cstay%3A${PINE.id}`);
    // On phones each morning lists every stay by name with its drive.
    const saturday = screen.getByRole("group", { name: "Sat Oct 10" });
    expect(within(saturday).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Ridge chalet10 min · 5\.6 mi.*Shortest that morning/), expect.stringMatching(/^Pine rental25 min · 5\.6 mi/)]);
    expect(within(screen.getByRole("group", { name: "Sum of planned outbound drives" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Ridge chalet30 min", "Pine rental1 hr 15 min"]);
    expect(screen.getByText("Ridge chalet has the lowest sum of planned outbound drives, 30 min. Pine rental: 45 min more.")).toBeInTheDocument();
    // A fourth can't be chosen with three.
    await user.click(screen.getByRole("checkbox", { name: /^Village hotel/ }));
    expect(screen.getByRole("checkbox", { name: /^Mountain lodge/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Ridge chalet/ })).toBeEnabled();
  });

  it("starts from the address, so returning to the page or reloading keeps the choice and nights", async () => {
    const { api } = await renderPage({ initial: { options: [`stay:${PINE.id}`, `candidate:${A}`], first_night: FRI, checkout: SUN } });
    await screen.findAllByRole("table");
    expect(compareCalls(api)[0].toString()).toBe(`options=stay%3A${PINE.id}%2Ccandidate%3A${A}&first_night=${FRI}&checkout=${SUN}`);
    expect(screen.getByLabelText("First night")).toHaveValue(FRI);
    expect(screen.getByLabelText("Check-out morning")).toHaveValue(SUN);
    // A property page opens in a new tab, leaving this one as it is.
    const links = screen.getAllByRole("link", { name: "Open Ridge chalet's website (new tab)" });
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows unknown drives beside known ones and compares no sums", async () => {
    await renderPage({ initial: { options: [`candidate:${A}`, `candidate:${B}`], first_night: FRI, checkout: SUN } });
    const saturday = await screen.findByRole("group", { name: "Sat Oct 10" });
    expect(within(saturday).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Ridge chalet10 min/), "Brook innLocation neededSet its location to compare drives"]);
    expect(screen.getByText("Sums aren't compared until every drive is known. Not known yet: Brook inn (no location). A missing drive never counts as zero.")).toBeInTheDocument();
    expect(screen.queryByText("Shortest that morning")).not.toBeInTheDocument();
  });

  it("asks again for new nights", async () => {
    const { api, user } = await renderPage({ initial: { options: [`candidate:${A}`, `stay:${PINE.id}`], first_night: null, checkout: null } });
    await screen.findAllByRole("table");
    expect(compareCalls(api)[0].get("checkout")).toBe("2026-10-12");
    await user.selectOptions(screen.getByLabelText("Check-out morning"), SUN);
    await waitFor(() => expect(compareCalls(api).at(-1)?.get("checkout")).toBe(SUN));
    expect(await screen.findByText("Fri Oct 9 → Sun Oct 11 · 2 nights", { selector: "p" })).toBeInTheDocument();
    expect(window.location.search).toContain(`first_night=${FRI}&checkout=${SUN}`);
  });

  it("adds an option without leaving the page, and adds it to the comparison", async () => {
    const saved = candidate("3c000000-0000-4000-8000-000000000003", LONG, null, { check_in: null, check_out: null });
    const posted: unknown[] = [];
    const { state, user } = await renderPage({ initial: { options: [`candidate:${A}`], first_night: null, checkout: null }, writes: {
      [`POST ${base}`]: (body: unknown) => { posted.push(body); state.candidates.push({ ...saved, id: (body as { candidate: { id: string } }).candidate.id }); return { status: 200, body: { candidate: { ...saved, id: (body as { candidate: { id: string } }).candidate.id } } }; },
    } });
    await user.click(await screen.findByRole("button", { name: "Add a stay to compare" }));
    await user.click(screen.getByLabelText("Stay name"));
    await user.paste(LONG);
    await user.click(screen.getByRole("button", { name: "Save option" }));
    expect(await screen.findByText(`${LONG} saved and added to the comparison.`)).toBeInTheDocument();
    expect(posted[0]).toMatchObject({ candidate: { name: LONG, check_in: null, cost_amount: null, cost_currency: null }, expected_revision: null });
    expect(await screen.findByRole("checkbox", { name: new RegExp(`${LONG} · Second in the comparison`) })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ridge chalet · First in the comparison/ })).toBeChecked();
  });

  it("keeps entered values after a failed save, and shows the saved option before saving over a change", async () => {
    let attempt = 0;
    const { user } = await renderPage({ writes: {
      [`PATCH ${base}/${A}`]: () => ++attempt === 1 ? { status: 500, body: { error: "Couldn't save the option. Your changes are still here; try again." } }
        : attempt === 2 ? { status: 409, body: { error: "This option changed since you opened it. Review the saved option, then save again.", current: { ...candidate(A, "Ridge chalet", RIDGE, { notes: "Sauna" }), revision: 4 } } }
        : { status: 200, body: { candidate: { ...candidate(A, "Ridge chalet", RIDGE, { notes: "Hot tub" }), revision: 5 } } },
    } });
    await user.click(await screen.findByRole("button", { name: "Change Ridge chalet" }));
    await user.type(screen.getByLabelText("Notes for the crew"), "Hot tub");
    await user.type(screen.getByLabelText("Amount"), "840");
    await user.click(screen.getByRole("button", { name: "Save option" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the option.");
    expect(screen.getByLabelText("Notes for the crew")).toHaveValue("Hot tub");
    await user.click(screen.getByRole("button", { name: "Save option" }));
    expect(await screen.findByText(/Ridge chalet · Fri Oct 9 → Sun Oct 11 · 2 nights · Sauna/)).toBeInTheDocument();
    expect(screen.getByLabelText("Notes for the crew")).toHaveValue("Hot tub");
    const sent = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init!.body)));
    expect(sent.map((body) => body.expected_revision)).toEqual([1, 1]);
    await user.click(screen.getByRole("button", { name: "Save over the saved option" }));
    expect(await screen.findByText("Ridge chalet saved.")).toBeInTheDocument();
    const last = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH").at(-1)!;
    expect(JSON.parse(String(last[1]!.body))).toMatchObject({ expected_revision: 4, candidate: { notes: "Hot tub", cost_amount: "840", cost_currency: "USD" } });
  });

  it("removes an option only after confirming, leaving stays alone", async () => {
    const removed: unknown[] = [];
    const { state, user } = await renderPage({ initial: { options: [`candidate:${A}`, `stay:${PINE.id}`], first_night: null, checkout: null }, writes: {
      [`DELETE ${base}/${A}`]: (body: unknown) => { removed.push(body); state.candidates.splice(0, 1); return { status: 200, body: { id: A, removed: true } }; },
    } });
    await user.click(await screen.findByRole("button", { name: "Remove Ridge chalet from the options" }));
    expect(screen.getByText("Your stays, nights and bookings don't change.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove option" }));
    expect(await screen.findByText("Ridge chalet removed from the options.")).toBeInTheDocument();
    expect(removed).toEqual([{ expected_revision: 1 }]);
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Ridge chalet/ })).not.toBeInTheDocument());
    expect(screen.getByText("Choose one more stay to compare.")).toBeInTheDocument();
  });

  it("wraps its buttons' labels, so large text never widens the page", async () => {
    // jsdom doesn't lay out: the browser check (docs/qa/213-compare-stays) measures it, at 200% text on 320 and 390px phones.
    await renderPage();
    expect(await screen.findByRole("button", { name: "Add a stay to compare" })).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
    expect(screen.getByRole("button", { name: "Change Ridge chalet" }).parentElement).toHaveClass("flex-wrap", "min-w-0");
    const one = splitDriveTrip();
    await renderPage({ full: { ...one, lodging: { ...one.lodging!, stays: one.lodging!.stays.slice(0, 1) } }, candidates: [] });
    expect(await screen.findByRole("button", { name: "Add another stay" })).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
  });

  it("still compares saved stays before options can be saved", async () => {
    await renderPage({ candidates: [], available: false });
    expect(await screen.findByText("Options can't be added yet. Saved stays can still be compared.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a stay to compare" })).not.toBeInTheDocument();
  });
});

describe("Use for these nights (#213)", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/trips/trip-1/stays/compare"); });
  afterEach(() => { vi.unstubAllGlobals(); });

  /** The server's preview of everyone, or the people named, moving into Ridge chalet on Friday and Saturday. */
  const usePreview = (memberIds = [ALEX, BLAIR, CASEY, DANA, ELI, FRAN].map((person) => person.id)): TripStayUsePreview => {
    const preview = previewLodgingChange(SPLIT_TRIP, splitRows(), SPLIT_MEMBERS, { action: "save", existing: false, occupants: memberIds, stay: {
      id: A, name: "Ridge chalet", check_in: FRI, check_out: SUN, type: null, address: null, property_url: null, check_in_time: null, check_out_time: null,
      notes: null, booking_status: "not_booked", location: RIDGE } });
    if ("error" in preview) throw new Error(preview.error);
    return { ...preview, member_ids: memberIds, stay_name: "Ridge chalet", new_stay: true, candidate_revision: 1, booked_kept: ["Pine rental", "Village hotel"] };
  };
  const initial = { options: [`stay:${PINE.id}`, `candidate:${A}`], first_night: FRI, checkout: SUN };

  it("previews who and which nights change, then saves only after the replacement is confirmed", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const full = splitDriveTrip();
    // The trip as it's loaded again after the save: Ridge chalet is a stay, with the option's id.
    const after: TripFull = { ...full, lodging: { ...full.lodging!, stays: [...full.lodging!.stays, { ...full.lodging!.stays[0], id: A, name: "Ridge chalet", location: RIDGE, booking_status: "not_booked" }] } };
    const { onPlanSaved, rerender, state, user } = await renderPage({ full, initial, writes: {
      [`POST ${base}/use`]: (body: unknown) => {
        const request = body as Record<string, unknown>;
        sent.push(request);
        return request.preview ? { status: 200, body: usePreview(request.member_ids as string[] | undefined) } : { status: 200, body: { revision: 5 } };
      },
    } });
    onPlanSaved.mockImplementation(async () => { state.candidates.splice(0, 1); await rerender(after); });
    await user.click((await screen.findAllByRole("button", { name: "Use Ridge chalet for these nights" }))[0]);
    expect(await screen.findByText("Move Alex, Blair and Dana from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.")).toBeInTheDocument();
    expect(sent[0]).toEqual({ option: `candidate:${A}`, first_night: FRI, checkout: SUN, preview: true });
    expect(screen.getByText("Nobody else's nights change.")).toBeInTheDocument();
    expect(screen.getByText("Pine rental and Village hotel stay booked: nothing is canceled. Change the booking on Stays once you've changed the reservation.")).toBeInTheDocument();
    expect(screen.getByText("Ridge chalet becomes a saved stay for Fri Oct 9 → Sun Oct 11 · 2 nights, booking not confirmed. Your other options stay as they are.")).toBeInTheDocument();
    // Their existing plans need explicit replacement before saving.
    const use = screen.getByRole("button", { name: "Use for these nights" });
    expect(use).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Replace their existing plans for Fri Oct 9, Sat Oct 10/ }));
    await user.click(screen.getByRole("button", { name: "Replace those nights and use it" }));
    expect(await screen.findByText("Ridge chalet is now the stay for these nights. Bookings weren't changed.")).toBeInTheDocument();
    const preview = usePreview();
    expect(sent[1]).toEqual({ option: `candidate:${A}`, first_night: FRI, checkout: SUN, preview: false, member_ids: preview.member_ids,
      expected_revision: preview.revision, expected_people_key: preview.people_key, mutation_id: expect.any(String), replace_nights: true,
      // The option as reviewed: an edit to it since then is refused.
      expected_candidate_revision: 1 });
    expect(onPlanSaved).toHaveBeenCalled();
    // The option is a saved stay now, and stays in the comparison as one.
    await waitFor(() => expect(window.location.search).toContain(`stay%3A${A}`));
  }, 20_000);

  it("asks again for the people chosen, and reviews again after the plan changed", async () => {
    const sent: Array<Record<string, unknown>> = [];
    let saves = 0;
    const { onPlanSaved, user } = await renderPage({ initial, writes: {
      [`POST ${base}/use`]: (body: unknown) => {
        const request = body as Record<string, unknown>;
        sent.push(request);
        if (request.preview) return { status: 200, body: usePreview(request.member_ids as string[] | undefined) };
        return ++saves === 1 ? { status: 409, body: { error: "The lodging plan changed. Review the saved plan before retrying." } } : { status: 200, body: { revision: 6 } };
      },
    } });
    await user.click((await screen.findAllByRole("button", { name: "Use Ridge chalet for these nights" }))[0]);
    await screen.findByText(/Move Alex, Blair and Dana/);
    for (const name of [/^Blair/, /^Casey/, /^Dana/, /^Eli/, /^Fran/]) await user.click(screen.getByRole("checkbox", { name }));
    expect(screen.queryByText(/Move Alex/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    expect(await screen.findByText("Move Alex from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.")).toBeInTheDocument();
    expect(sent.at(-1)).toMatchObject({ member_ids: [ALEX.id], preview: true });
    await user.click(screen.getByRole("checkbox", { name: /Replace their existing plans/ }));
    await user.click(screen.getByRole("button", { name: "Replace those nights and use it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The lodging plan changed.");
    await user.click(screen.getByRole("button", { name: "Review again" }));
    expect(onPlanSaved).toHaveBeenCalledOnce();
    await screen.findByText("Move Alex from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.");
    expect(sent.at(-1)).toMatchObject({ member_ids: [ALEX.id], preview: true });
  }, 20_000);

  it("isn't offered to members", async () => {
    await renderPage({ initial, canEdit: false });
    await screen.findAllByRole("table");
    expect(screen.queryByRole("button", { name: /for these nights/ })).not.toBeInTheDocument();
  });
});
