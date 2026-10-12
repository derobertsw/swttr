import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import FAQ from "./page";
import { TemperatureUnitProvider } from "@/components/TemperatureUnitProvider";
import { STORAGE_KEYS } from "@/lib/storage";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, isLoaded: true }) }));
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => window.localStorage.removeItem(`${STORAGE_KEYS.TEMPERATURE_UNIT}:guest`));

describe("FAQ temperature examples", () => {
  it.each([
    ["F", "92.7°F", "86°F", "69.8°F", "32°F", "14°F"],
    ["C", "33.7°C", "30°C", "21°C", "0°C", "-10°C"],
  ] as const)("respects the saved %s preference", async (unit, neutral, minimum, resting, mild, extreme) => {
    window.localStorage.setItem(`${STORAGE_KEYS.TEMPERATURE_UNIT}:guest`, unit);
    const user = userEvent.setup();
    render(<TemperatureUnitProvider><FAQ /></TemperatureUnitProvider>);

    await user.click(screen.getByRole("button", { name: "How does SWTTR determine what to wear?" }));
    expect(screen.getByText(/comfortable skin temperature/)).toHaveTextContent(neutral);
    await user.click(screen.getByRole("button", { name: "What is the target clo range?" }));
    expect(screen.getByText(/The algorithm computes two baselines/)).toHaveTextContent(minimum);
    expect(screen.getByText(/The algorithm computes two baselines/)).toHaveTextContent(neutral);
    await user.click(screen.getByRole("button", { name: "What are clo values?" }));
    expect(screen.getByText(/Clo is a standard unit/)).toHaveTextContent(resting);
    await user.click(screen.getByRole("button", { name: "Why do hands and head need special treatment?" }));
    expect(screen.getByText(/Extremities lose heat/)).toHaveTextContent(`2% per °C from ${mild} down to ${extreme}`);
  });
});

describe("FAQ support claims", () => {
  async function answerTo(question: string) {
    const user = userEvent.setup();
    render(<TemperatureUnitProvider><FAQ /></TemperatureUnitProvider>);
    await user.click(screen.getByRole("button", { name: question }));
    return screen.getByRole("region", { name: question });
  }

  it("leads with using SWTTR before how the advice is worked out", () => {
    render(<TemperatureUnitProvider><FAQ /></TemperatureUnitProvider>);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Using SWTTR",
      "How the advice is worked out",
    ]);
  });

  it("doesn't claim a body-and-gear model for Hiking / Snowshoeing", async () => {
    const answer = await answerTo("Which activities get which advice?");
    expect(answer).toHaveTextContent(
      "Hiking / Snowshoeing has no model for your body and gear yet, so it always gets general layers."
    );
  });

  it("says multi-day plans give general layers only to activities that have them, signed in or not", async () => {
    const answer = await answerTo("Can I plan for a later day or a multi-day trip?");
    expect(answer).toHaveTextContent(
      "For Alpine Skiing, XC Skiing and Hiking / Snowshoeing, each day gets general layers"
    );
    expect(answer).toHaveTextContent("Running, Biking and Backcountry Skiing get each day's weather without layers");
    expect(answer).toHaveTextContent("layers come from the forecast temperature whether or not you're signed in");
  });

  it("says Wardrobe needs an account and custom items are estimates", async () => {
    const answer = await answerTo("How do I add my gear?");
    expect(answer).toHaveTextContent(/^Sign in, open Wardrobe/);
    expect(answer).toHaveTextContent("SWTTR estimates its warmth, labeled as an estimate");
    expect(answer).not.toHaveTextContent(/measured/i);
  });
});
