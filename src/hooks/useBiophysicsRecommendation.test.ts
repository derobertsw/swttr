import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { BiophysicsOutcome } from "@/types/biophysics";
import { useBiophysicsRecommendation } from "./useBiophysicsRecommendation";

const mockUseAuth = vi.fn(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/logger", () => ({ logWarn: vi.fn() }));

const WEATHER = { temperature: 20, windSpeed: 10 };
const BODY = { heightInches: 70, weightLbs: 170 };

async function fetchOutcome(activity: string): Promise<BiophysicsOutcome> {
  const { result } = renderHook(() => useBiophysicsRecommendation());
  let outcome: BiophysicsOutcome | undefined;
  await act(async () => {
    outcome = await result.current.fetch(activity, WEATHER, "moderate", BODY);
  });
  return outcome!;
}

describe("useBiophysicsRecommendation", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the recommendation when the API has one", async () => {
    const recommendation = { recommendation: { score: 80, garments: [] } };
    fetchMock.mockResolvedValue(Response.json(recommendation));

    expect(await fetchOutcome("running")).toEqual({ status: "ok", data: recommendation });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/recommendations/running", expect.anything());
  });

  it("reports activities without a biophysics model as unsupported, without a request", async () => {
    expect(await fetchOutcome("hiking_snowshoeing")).toEqual({ status: "unsupported", data: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a signed-out 401 as sign-in required", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Authentication required" }, { status: 401 }));
    expect(await fetchOutcome("running")).toEqual({ status: "auth_required", data: null });
  });

  it("reports targets without a recommendation as no usable gear", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: "No suitable garments found in database", ireq: { min: 1, neutral: 1.4 } })
    );
    expect(await fetchOutcome("running")).toEqual({ status: "no_gear", data: null });
  });

  it.each([
    ["a server error", () => Response.json({ error: "boom" }, { status: 500 })],
    ["a response with neither a recommendation nor targets", () => Response.json({})],
  ])("reports %s as unavailable", async (_, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await fetchOutcome("running")).toEqual({ status: "unavailable", data: null });
  });

  it("reports a network failure as unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchOutcome("backcountry_skiing")).toEqual({ status: "unavailable", data: null });
  });
});
