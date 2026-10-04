import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemperatureUnitProvider, useTemperatureUnit } from "./TemperatureUnitProvider";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { ResultHeader } from "./layers/ResultHeader";
import MultiDayPlanDisplay from "./MultiDayPlanDisplay";
import { STORAGE_KEYS } from "@/lib/storage";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";

let userId: string | null = null;
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => userId }));

const guestKey = `${STORAGE_KEYS.TEMPERATURE_UNIT}:guest`;
const settingsProps = {
  sensitivity: "neutral" as const,
  defaultActivity: "alpine_skiing",
  onSensitivityChange: vi.fn(),
  onDefaultActivityChange: vi.fn(),
  onBodyMetricsChange: vi.fn(),
};

function UnitControl() {
  const { temperatureUnit, updateTemperatureUnit } = useTemperatureUnit();
  return (
    <>
      <output aria-label="Selected unit">{temperatureUnit}</output>
      <button onClick={() => updateTemperatureUnit("F")}>Use F</button>
      <button onClick={() => updateTemperatureUnit("C")}>Use C</button>
    </>
  );
}

describe("temperature preference", () => {
  beforeEach(() => {
    userId = null;
    window.localStorage.clear();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("restores a saved choice on remount and keeps accounts and guests independent", async () => {
    const user = userEvent.setup();
    const tree = () => <TemperatureUnitProvider><UnitControl /></TemperatureUnitProvider>;
    const first = render(tree());
    await user.click(screen.getByRole("button", { name: "Use C" }));
    expect(window.localStorage.getItem(guestKey)).toBe("C");
    first.unmount();

    const next = render(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
    userId = "account-a";
    next.rerender(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("F");
    await user.click(screen.getByRole("button", { name: "Use C" }));
    userId = "account-b";
    next.rerender(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("F");
    userId = "account-a";
    next.rerender(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
    userId = null;
    next.rerender(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
  });

  it("uses the locale for absent or corrupt data and survives unavailable storage", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    window.localStorage.setItem(guestKey, "kelvin");
    const tree = () => <TemperatureUnitProvider><UnitControl /></TemperatureUnitProvider>;
    const view = render(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
    vi.spyOn(window.Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Denied"); });
    view.rerender(tree());
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
  });

  it("updates when another tab saves or clears the preference", () => {
    render(<TemperatureUnitProvider><UnitControl /></TemperatureUnitProvider>);
    act(() => {
      window.localStorage.setItem(guestKey, "C");
      window.dispatchEvent(new StorageEvent("storage", { key: guestKey }));
    });
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("C");
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByLabelText("Selected unit")).toHaveTextContent("F");
  });

  it("hydrates from the server's stable snapshot without a mismatch", async () => {
    window.localStorage.setItem(guestKey, "C");
    const tree = <TemperatureUnitProvider><UnitControl /></TemperatureUnitProvider>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    expect(container.querySelector("output")).toHaveTextContent("F");
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }); });
    expect(container.querySelector("output")).toHaveTextContent("C");
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("changes settings by keyboard, updates air temperature and wind chill, and preserves the source value", async () => {
    const user = userEvent.setup();
    const temperature = 20.4;
    render(
      <TemperatureUnitProvider>
        <ResultHeader temperature={temperature} windspeed={15} />
        <PreferencesDrawer {...settingsProps} open />
      </TemperatureUnitProvider>
    );
    const fahrenheit = screen.getByRole("radio", { name: "Fahrenheit (°F)" });
    fahrenheit.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Celsius (°C)" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Celsius (°C)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("-6°C")).toBeInTheDocument();
    expect(screen.getByText(/Feels like -14°C/)).toBeInTheDocument();
    expect(window.localStorage.getItem(guestKey)).toBe("C");
    await user.keyboard("{ArrowLeft}{ArrowRight}{ArrowLeft}");
    expect(screen.getByText("20°F")).toBeInTheDocument();
    expect(temperature).toBe(20.4);
  });

  it("keeps the previous setting and announces a failed storage write", async () => {
    const user = userEvent.setup();
    render(<TemperatureUnitProvider><PreferencesDrawer {...settingsProps} open /></TemperatureUnitProvider>);
    vi.spyOn(window.Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full"); });
    screen.getByRole("radio", { name: "Celsius (°C)" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save temperature units");
    expect(screen.getByRole("radio", { name: "Fahrenheit (°F)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    vi.restoreAllMocks();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("converts daily and daypart ranges without mutating the plan or refetching its packing list", async () => {
    const user = userEvent.setup();
    const plan = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"), durationDays: 1,
      hourlyForecast: [
        { time: "2026-01-15T08:00", temperature: 14, windSpeed: 8, precipitationProbability: 0 },
        { time: "2026-01-15T12:00", temperature: 32, windSpeed: 8, precipitationProbability: 0 },
      ],
      getRecommendation: (temperature) => ({
        torso: {
          base: [{ name: "Merino crew" }],
          mid: temperature < 20 ? [{ name: "Fleece" }] : [],
          outer: [],
        },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      }),
    });
    const original = JSON.stringify(plan);
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TemperatureUnitProvider>
        <UnitControl />
        <MultiDayPlanDisplay plan={plan} />
      </TemperatureUnitProvider>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Use C" }));
    expect(screen.getByText("-10°C – 0°C")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Through Thu, Jan 15" })).toHaveTextContent("Midday · 11am-3pm · 0°C – 0°C");
    await user.click(screen.getByRole("button", { name: "Use F" }));
    expect(screen.getByText("14°F – 32°F")).toBeInTheDocument();
    expect(JSON.stringify(plan)).toBe(original);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(request.days).toEqual(plan.days);
  });
});
