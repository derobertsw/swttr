import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FEEDBACK_RECHECK_MAX_MS, GearUpFeedback, OutingFeedbackCard, TripDayFeedback } from "@/components/OutingFeedback";
import { resultFeedbackKey, suggestedWornItems } from "@/lib/outing-feedback";
import { savedOutfit } from "@/test/savedKit";
import type { FeedbackAnswer, OutingFeedbackView } from "@/types/outingFeedback";

const SUGGESTED = suggestedWornItems(savedOutfit());
const saved = (answer: FeedbackAnswer): OutingFeedbackView => ({ ...answer, updated_at: "2026-10-10T16:00:00Z" });
const WARDROBE = [
  { id: "w1", item_type: "garment", item_id: "g-9", details: { brand: "Patagonia", model_name: "Capilene Cool Tee", garment_type: "t_shirt" } },
  { id: "w2", item_type: "handwear", item_id: "h-2", details: { brand: "HEAD", model_name: "Ultrafit Running Gloves" } },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/** A response read without real I/O, for fake timers. */
function plainResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

describe("OutingFeedbackCard (#8)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/wardrobe/gear" ? jsonResponse({ items: WARDROBE }) : Promise.reject(new Error(url))));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("saves with one tap, saying nothing about what was worn", async () => {
    const onSave = vi.fn(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Too warm" }));
    expect(onSave).toHaveBeenCalledWith({ overall: "too_warm", moments: [], body_areas: [], worn: null });
    expect(await screen.findByText("Saved. Thanks. Add details below if you like.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Too warm" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adds when, where and a corrected outfit as details", async () => {
    const onSave = vi.fn(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Too warm" }));
    await userEvent.click(await screen.findByRole("button", { name: "While moving" }));
    await userEvent.click(screen.getByRole("button", { name: "Torso" }));
    await userEvent.click(screen.getByRole("button", { name: "Legs" }));
    await userEvent.click(screen.getByRole("radio", { name: "Something different" }));
    // The suggested layers are the starting point: take off what wasn't worn, add what was.
    for (const name of ["Merino crew", "Fleece", "Ski shell", "Long johns", "Ski pants"]) {
      await userEvent.click(screen.getByRole("button", { name: `Didn't wear ${name}` }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Shorts" }));
    await userEvent.click(screen.getByRole("button", { name: "No hat" }));
    await userEvent.selectOptions(await screen.findByLabelText("From your wardrobe"), "w1");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(onSave).toHaveBeenLastCalledWith({
      overall: "too_warm", moments: ["sustained"], body_areas: ["torso", "legs"],
      worn: { as_suggested: false, bare: ["head_neck"], items: [
        { source: "suggested", area: "hands", name: "Insulated gloves", item_id: "h-1" },
        { source: "generic", generic: "shorts", name: "Shorts", area: "legs" },
        { source: "wardrobe", area: "torso", name: "Capilene Cool Tee", item_id: "g-9" },
      ] },
    });
    expect(await screen.findByText("Details saved. Thanks.")).toBeInTheDocument();
  });

  it("takes off what's on an area marked bare, and asks for something before saving a different outfit", async () => {
    const onSave = vi.fn(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Just right" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Something different" }));
    await userEvent.click(screen.getByRole("button", { name: "No gloves" }));
    expect(screen.queryByRole("button", { name: "Didn't wear Insulated gloves" })).not.toBeInTheDocument();
    for (const name of ["Merino crew", "Fleece", "Ski shell", "Long johns", "Ski pants"]) {
      await userEvent.click(screen.getByRole("button", { name: `Didn't wear ${name}` }));
    }
    await userEvent.click(screen.getByRole("button", { name: "No gloves" }));
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("doesn't ask when or where for just right, and confirms the suggested layers when said", async () => {
    const onSave = vi.fn(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Just right" }));
    await userEvent.click(await screen.findByRole("radio", { name: "What was suggested" }));
    expect(screen.queryByRole("button", { name: "At stops" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(onSave).toHaveBeenLastCalledWith({ overall: "just_right", moments: [], body_areas: [], worn: { as_suggested: true } });
  });

  it("keeps the answer after a failed save, and saves it with Try again", async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error("Check your connection and try again."))
      .mockImplementation(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Too cold" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your feedback: Check your connection and try again.");
    expect(screen.queryByRole("button", { name: "Save details" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({ overall: "too_cold", moments: [], body_areas: [], worn: null });
    expect(await screen.findByText("Saved. Thanks. Add details below if you like.")).toBeInTheDocument();
  });

  it("shows an earlier answer to change", async () => {
    const onSave = vi.fn(async (answer: FeedbackAnswer) => saved(answer));
    render(<OutingFeedbackCard suggested={SUGGESTED} onSave={onSave}
      initial={saved({ overall: "too_cold", moments: ["stops"], body_areas: ["hands"], worn: { as_suggested: true } })} />);
    expect(screen.getByText("You told us: Too cold.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "At stops" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "What was suggested" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Too warm" }));
    expect(onSave).toHaveBeenLastCalledWith({ overall: "too_warm", moments: ["stops"], body_areas: ["hands"], worn: { as_suggested: true } });
  });
});

describe("GearUpFeedback", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sends the outfit as shown with the result's preference, under one key for the result", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      jsonResponse({ feedback: saved(JSON.parse(String(init?.body)).answer) }));
    vi.stubGlobal("fetch", fetchMock);
    const outfit = savedOutfit();
    render(<GearUpFeedback outfit={outfit} sensitivity="hot" />);
    await userEvent.click(screen.getByRole("button", { name: "Too cold" }));
    await screen.findByText("Saved. Thanks. Add details below if you like.");
    await userEvent.click(screen.getByRole("button", { name: "Just right" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [first, second] = fetchMock.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }));
    expect(first).toMatchObject({ url: "/api/v1/outing-feedback", body: { outfit, sensitivity: "hot", answer: { overall: "too_cold" } } });
    expect(second.body.key).toBe(first.body.key);
    expect(second.body.answer.overall).toBe("just_right");
  });
});

describe("TripDayFeedback", () => {
  const URL = "/api/v1/trips/trip-1/days/2026-10-10/feedback";
  const dayFeedback = () =>
    <TripDayFeedback tripId="trip-1" date="2026-10-10" kit={savedOutfit()} kitId="kit-1" savedAt="2026-10-08T20:00:00Z" />;
  const gets = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method !== "PUT").length;
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows nothing before the outing starts", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ status: "not_started", opens_at: "2026-10-10T13:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(dayFeedback());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(URL, expect.anything()));
    expect(container).toBeEmptyDOMElement();
  });

  it("asks again when the outing starts, on a page left open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: Date.parse("2026-10-10T12:30:00Z") });
    let started = false;
    const fetchMock = vi.fn(() => plainResponse(started ? { status: "open", feedback: null }
      : { status: "not_started", opens_at: "2026-10-10T13:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    render(dayFeedback());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(gets(fetchMock)).toBe(1);
    started = true;
    await act(() => vi.advanceTimersByTimeAsync(29 * 60 * 1000));
    expect(gets(fetchMock)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(2 * 60 * 1000));
    expect(gets(fetchMock)).toBe(2);
    vi.useRealTimers();
    expect(await screen.findByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
  });

  it("waits at most an hour between checks for an outing that starts much later", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: Date.parse("2026-10-08T12:00:00Z") });
    const fetchMock = vi.fn(() => plainResponse({ status: "not_started", opens_at: "2026-10-10T13:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    render(dayFeedback());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(gets(fetchMock)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(FEEDBACK_RECHECK_MAX_MS - 1));
    expect(gets(fetchMock)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(gets(fetchMock)).toBe(2);
  });

  it("asks again when the page is shown again, back from the outing", async () => {
    let started = false;
    const fetchMock = vi.fn(() => jsonResponse(started ? { status: "open", feedback: null }
      : { status: "not_started", opens_at: "2099-10-10T13:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    render(dayFeedback());
    await waitFor(() => expect(gets(fetchMock)).toBe(1));
    started = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
    // Once it's open, coming back doesn't ask again.
    window.dispatchEvent(new Event("focus"));
    expect(gets(fetchMock)).toBe(2);
  });

  it("asks once it has started, and saves to the trip day, about the kit shown", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => init?.method === "PUT"
      ? jsonResponse({ feedback: saved(JSON.parse(String(init.body)).answer) })
      : jsonResponse({ status: "open", feedback: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(dayFeedback());
    await userEvent.click(await screen.findByRole("button", { name: "Too cold" }));
    await screen.findByText("Saved. Thanks. Add details below if you like.");
    expect(fetchMock).toHaveBeenLastCalledWith(URL, expect.objectContaining({
      method: "PUT", body: JSON.stringify({ answer: { overall: "too_cold", moments: [], body_areas: [], worn: null },
        kit: { id: "kit-1", saved_at: "2026-10-08T20:00:00Z" } }),
    }));
  });

  it("says to reload when the kit was replaced since, without offering to send it again", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => init?.method === "PUT"
      ? jsonResponse({ error: "Your kit for this day changed since this page opened. Reload to answer about the kit saved now.", code: "kit_changed" }, 409)
      : jsonResponse({ status: "open", feedback: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(dayFeedback());
    await userEvent.click(await screen.findByRole("button", { name: "Too cold" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your kit for this day changed since this page opened. Reload");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("resultFeedbackKey", () => {
  it("is the same for one result, whatever is edited on it, and new for a result asked for again", () => {
    const result = { kind: "layers" };
    const again = { ...result };
    expect(resultFeedbackKey(result)).toBe(resultFeedbackKey(result));
    expect(resultFeedbackKey(again)).not.toBe(resultFeedbackKey(result));
  });
});
