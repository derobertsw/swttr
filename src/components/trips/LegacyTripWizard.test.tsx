import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ORGANIZER,
  SAM,
  STOWE_PLACE,
  STOWE_STOP,
  TRIP,
  fakeTripApi,
  reply,
  sentBodies,
  tripFull,
} from "@/test/tripApi";
import NewTripPage from "./LegacyTripWizard";
import { buildLodging } from "@/lib/trip-lodging";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// These tests cover the wizard, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** Opens the page as if its URL had this query string. */
function setQuery(query: string) {
  for (const key of [...mockSearchParams.keys()]) mockSearchParams.delete(key);
  for (const [key, value] of new URLSearchParams(query)) mockSearchParams.set(key, value);
}

/** Picks two days of the month the calendar opens on, and returns them as trip dates. */
async function pickDays(user: ReturnType<typeof userEvent.setup>, first: number, last: number, month = new Date()) {
  const days = [first, last].map((day) => new Date(month.getFullYear(), month.getMonth(), day));
  for (const day of days) {
    await user.click(screen.getByRole("button", { name: new RegExp(format(day, "PPPP")) }));
  }
  return days.map((day) => format(day, "yyyy-MM-dd"));
}

/** Fills in step 1 and creates the trip. */
async function createTrip(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Whistler Powder"), "Whistler");
  const dates = await pickDays(user, 10, 12);
  await user.click(screen.getByRole("button", { name: "Create trip" }));
  return dates;
}

const savedTrip = (body: unknown) => reply(201, { trip: { ...TRIP, ...(body as object) } });

describe("New trip wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQuery("");
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the trip once, then edits it when you come back to the first step", async () => {
    const fetchMock = fakeTripApi({
      "POST /api/v1/trips": savedTrip,
      "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      "PATCH /api/v1/trips/trip-1": (body) => reply(200, { trip: { ...TRIP, ...(body as object) } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NewTripPage />);

    const [start, end] = await createTrip(user);

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved to your trips");
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toEqual([
      { name: "Whistler", start_date: start, end_date: end },
    ]);
    expect(window.location.search).toBe("?trip=trip-1&step=2");

    // Back, then Next with nothing changed, saves nothing.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Exit" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();

    // A new name updates the trip already created.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByPlaceholderText("Whistler Powder"), " Powder");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1")).toEqual([{ name: "Whistler Powder" }]);
    expect(sentBodies(fetchMock, "POST /api/v1/trips")).toHaveLength(1);
  });

  describe("in a time zone ahead of UTC", () => {
    const originalTimeZone = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = "Pacific/Auckland";
    });

    afterAll(() => {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    });

    it("saves the days that were picked", async () => {
      const fetchMock = fakeTripApi({
        "POST /api/v1/trips": savedTrip,
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<NewTripPage />);

      const [start, end] = await createTrip(user);

      await screen.findByRole("heading", { name: "Where?" });
      expect(sentBodies(fetchMock, "POST /api/v1/trips")).toEqual([
        { name: "Whistler", start_date: start, end_date: end },
      ]);
    });
  });

  it("reopens the saved trip after a refresh instead of starting another", async () => {
    setQuery("trip=trip-1&step=3");
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(
        200,
        tripFull({ stops: [STOWE_STOP], members: [ORGANIZER, SAM] })
      ),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NewTripPage />);

    expect(await screen.findByRole("heading", { name: "Your crew" })).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Stowe, Vermont")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByPlaceholderText("Whistler Powder")).toHaveValue("Whistler");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    // Only the request that reopened the trip: nothing was created or changed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reviews preserved stays and morning origins before confirming changed trip dates", async () => {
    setQuery("trip=trip-1&step=1");
    const lodging = buildLodging({ ...TRIP, lodging_revision: 2 }, [], []);
    let attempts = 0;
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ lodging })),
      "PATCH /api/v1/trips/trip-1": (body) => ++attempts === 1
        ? reply(409, { error: "Review stay dates", lodging_after: lodging, lodging_revision: 2 })
        : reply(200, { trip: { ...TRIP, ...(body as object) } }),
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    render(<NewTripPage />);
    await screen.findByRole("heading", { name: "When?" });
    const [start, end] = await pickDays(user, 14, 16, new Date(`${TRIP.start_date}T00:00:00`));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Review stays before changing dates" });
    expect(within(dialog).getAllByText(/Starting from Not set/).length).toBeGreaterThan(0);
    expect(attempts).toBe(1);
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")).toEqual([
      { start_date: start, end_date: end },
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Keep stays and change trip dates" }));
    expect(await screen.findByRole("heading", { name: "Where?" })).toBeInTheDocument();
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")).toEqual([
      { start_date: start, end_date: end },
      { start_date: start, end_date: end, lodging_revision: 2 },
    ]);
  });

  it.each([1, 2])("shows the saved month when opening step %s and replacing the range", async (step) => {
    const today = new Date();
    const month = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    const trip = {
      ...TRIP,
      start_date: format(new Date(month.getFullYear(), month.getMonth(), 10), "yyyy-MM-dd"),
      end_date: format(new Date(month.getFullYear(), month.getMonth(), 12), "yyyy-MM-dd"),
    };
    setQuery(`trip=trip-1&step=${step}`);
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ trip })),
      "PATCH /api/v1/trips/trip-1": (body) => reply(200, { trip: { ...trip, ...(body as object) } }),
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    render(<NewTripPage />);
    await screen.findByRole("heading", { name: step === 1 ? "When?" : "Where?" });
    if (step === 2) await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("grid", { name: format(month, "LLLL yyyy") })).toBeInTheDocument();
    const [start, end] = await pickDays(user, 14, 16, month);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("heading", { name: "Where?" });
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")).toEqual([
      { start_date: start, end_date: end },
    ]);
  });

  it("says so when the saved trip can't be reopened", async () => {
    setQuery("trip=trip-gone&step=2");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({ "GET /api/v1/trips/trip-gone": reply(404, { error: "Not found" }) })
    );
    render(<NewTripPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reopen your trip: Not found");
    expect(screen.getByRole("heading", { name: "When?" })).toBeInTheDocument();
  });

  it("loads saved stop assignments when reopening a legacy wizard link", async () => {
    setQuery("trip=trip-1&step=2");
    vi.stubGlobal("fetch", fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP], days: [{ id: "day-1", trip_id: TRIP.id, date: "2026-10-11", stop_id: STOWE_STOP.id, activity: null }] })),
    }));
    const user = userEvent.setup();
    render(<NewTripPage />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit stop Stowe, Vermont" });
    await within(dialog).findByText(/Already assigned to Stowe, Vermont: 2026-10-11/);
    expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the form when the trip can't be created", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "POST /api/v1/trips": reply(401) }));
    const user = userEvent.setup();
    render(<NewTripPage />);

    await createTrip(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't create the trip: Request failed (401)"
    );
    expect(screen.getByPlaceholderText("Whistler Powder")).toHaveValue("Whistler");
    expect(screen.getByRole("button", { name: "Create trip" })).toBeEnabled();
    expect(window.location.search).toBe("");
  });

  it.each([false, true])("blocks leaving while %s saved trip basics are pending and retains input after failure", async (existing) => {
    let finish = () => {};
    const pending = () => new Promise<ReturnType<typeof reply>>((resolve) => { finish = () => resolve(reply(500, { error: "Unavailable" })); });
    if (existing) setQuery("trip=trip-1&step=1");
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      "POST /api/v1/trips": pending,
      "PATCH /api/v1/trips/trip-1": pending,
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); render(<NewTripPage />);
    if (existing) {
      await user.type(await screen.findByPlaceholderText("Whistler Powder"), " Powder");
      await user.click(screen.getByRole("button", { name: "Save changes" }));
    } else { await createTrip(user); }
    const back = screen.getByRole("button", { name: existing ? "Exit" : "Cancel" });
    const saving = screen.getByRole("button", { name: "Saving…" });
    expect(saving).toHaveFocus();
    expect(saving).not.toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
    await user.keyboard("{Enter}{Enter}");
    expect(sentBodies(api, existing ? "PATCH /api/v1/trips/trip-1" : "POST /api/v1/trips")).toHaveLength(1);
    expect(back).toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
    expect(back).toBeEnabled();
    expect(screen.getByRole("button", { name: existing ? "Save changes" : "Create trip" })).toHaveFocus();
    expect(screen.getByPlaceholderText("Whistler Powder")).toHaveValue(existing ? "Whistler Powder" : "Whistler");
  });

  it("keeps the chosen place when a stop can't be added, so it can be retried", async () => {
    setQuery("trip=trip-1&step=2");
    let stopAttempts = 0;
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }),
        "POST /api/v1/trips/trip-1/stops": () =>
          ++stopAttempts === 1
            ? reply(500, { error: "Database unavailable" })
            : reply(201, { stop: STOWE_STOP }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const search = await screen.findByRole("combobox");
    await user.type(search, "Stowe");
    await user.click(await screen.findByRole("option", { name: /Stowe/ }));
    await user.click(screen.getByRole("button", { name: "Add stop" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add the stop", {
        description: "Database unavailable",
      })
    );
    expect(search).toHaveValue("Stowe, Vermont, United States");
    expect(screen.queryByText("Stowe, Vermont")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add stop" }));

    expect(await screen.findByText("Stowe, Vermont")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("stays on the stops step until a stop being added is saved", async () => {
    setQuery("trip=trip-1&step=2");
    let finishAdd = () => {};
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP] })),
        "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }),
        // Hold the save open until the test finishes it.
        "POST /api/v1/trips/trip-1/stops": () =>
          new Promise((resolve) => {
            finishAdd = () => resolve(reply(500, { error: "Database unavailable" }));
          }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const search = await screen.findByRole("combobox");
    await user.type(search, "Stowe");
    await user.click(await screen.findByRole("option", { name: /Stowe/ }));
    await user.click(screen.getByRole("button", { name: "Add stop" }));

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await act(async () => finishAdd());
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    expect(search).toHaveValue("Stowe, Vermont, United States");
  });

  it("keeps a stop listed when removing it fails", async () => {
    setQuery("trip=trip-1&step=2");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP] })),
        "DELETE /api/v1/trips/trip-1/stops/stop-stowe": reply(500, {
          error: "Database unavailable",
        }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    await user.click(await screen.findByRole("button", { name: "Remove Stowe, Vermont" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't remove the stop", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByText("Stowe, Vermont")).toBeInTheDocument();
  });

  it("keeps the name when someone can't be added to the crew", async () => {
    setQuery("trip=trip-1&step=3");
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        "POST /api/v1/trips/trip-1/members": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const nameInput = await screen.findByPlaceholderText("Display name");
    await user.type(nameInput, "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add Sam", {
        description: "Database unavailable",
      })
    );
    expect(nameInput).toHaveValue("Sam");
    expect(screen.queryByText("invited · pending")).not.toBeInTheDocument();
  });

  it("stays on the crew step until someone being added is saved", async () => {
    setQuery("trip=trip-1&step=3");
    let finishAdd = () => {};
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        // Hold the save open until the test finishes it.
        "POST /api/v1/trips/trip-1/members": () =>
          new Promise((resolve) => {
            finishAdd = () => resolve(reply(500, { error: "Database unavailable" }));
          }),
      })
    );
    const user = userEvent.setup();
    render(<NewTripPage />);

    const nameInput = await screen.findByPlaceholderText("Display name");
    await user.type(nameInput, "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await act(async () => finishAdd());
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    expect(nameInput).toHaveValue("Sam");
  });

  describe("the stop sheet", () => {
    /** Opens step 2 of a trip with one stop, Stowe. */
    async function openStops(routes: Parameters<typeof fakeTripApi>[0] = {}) {
      setQuery("trip=trip-1&step=2");
      const fetchMock = fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP] })),
        ...routes,
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<NewTripPage />);
      const edit = await screen.findByRole("button", { name: "Edit" });
      return { user, edit, fetchMock };
    }

    it("takes focus, keeps it, and returns it to Edit when it closes", async () => {
      const { user, edit } = await openStops();

      await user.click(edit);
      const sheet = await screen.findByRole("dialog", { name: "Edit stop Stowe, Vermont" });
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
      for (let i = 0; i < 20; i++) {
        await user.tab();
        expect(sheet).toContainElement(document.activeElement as HTMLElement);
      }

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(edit).toHaveFocus();

      // After tabbing to the close button, too.
      await user.click(edit);
      const close = within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" });
      // Loading saved assignments can enable date buttons ahead of the
      // initially focused activity, so tab through them to reach Close.
      for (let i = 0; i < 20 && document.activeElement !== close; i++) {
        await user.tab({ shift: true });
      }
      expect(close).toHaveFocus();
      await user.keyboard("{Enter}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(edit).toHaveFocus();

      // A tap focuses nothing, so the Edit button is found by its id.
      edit.blur();
      fireEvent.click(edit);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(edit).toHaveFocus();
    });

    it("doesn't hand focus back to a field a tap left it in", async () => {
      const { user, edit } = await openStops();

      // On iOS, tapping a button leaves focus in the field being typed in.
      screen.getByRole("combobox").focus();
      fireEvent.click(edit);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(edit).toHaveFocus();
    });

    it("can't be closed while saving, and stays open with its picks when the save fails", async () => {
      let finishSave = () => {};
      const { user, edit } = await openStops({
        // Hold the save open until the test finishes it.
        "PATCH /api/v1/trips/trip-1/stops/stop-stowe": () =>
          new Promise((resolve) => {
            finishSave = () => resolve(reply(500, { error: "Database unavailable" }));
          }),
      });

      await user.click(edit);
      const sheet = await screen.findByRole("dialog");
      await user.click(within(sheet).getByRole("button", { name: "Alpine" }));
      const save = within(sheet).getByRole("button", { name: "Save stop" });
      await user.click(save);

      expect(within(sheet).getByRole("button", { name: "Close" })).toBeDisabled();
      expect(save).toHaveFocus();
      await user.keyboard("{Escape}");
      fireEvent.pointerDown(document.body);
      expect(screen.getByRole("dialog")).toBe(sheet);

      await act(async () => finishSave());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't save the stop", {
          description: "Database unavailable",
        })
      );
      expect(screen.getByRole("dialog")).toBe(sheet);
      expect(within(sheet).getByRole("button", { name: "Alpine" })).toHaveAttribute("aria-pressed", "true");
      expect(within(sheet).getByRole("button", { name: "Close" })).toBeEnabled();
    });

    it("closes once saved and returns focus to Edit", async () => {
      const { user, edit, fetchMock } = await openStops({
        "PATCH /api/v1/trips/trip-1/stops/stop-stowe": (body) =>
          reply(200, { stop: { ...STOWE_STOP, ...(body as { activities: string[] }) } }),
      });

      await user.click(edit);
      const sheet = await screen.findByRole("dialog");
      await user.click(within(sheet).getByRole("button", { name: "Alpine" }));
      await user.click(within(sheet).getByRole("button", { name: "Save stop" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("Alpine")).toBeInTheDocument();
      expect(edit).toHaveFocus();
      expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1/stops/stop-stowe")).toEqual([
        { activities: ["Alpine"], day_dates: [] },
      ]);
    });
  });
});
