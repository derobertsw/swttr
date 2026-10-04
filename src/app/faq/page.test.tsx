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
    ["F", "92.7°F", "86°F", "69.8°F", "14°F"],
    ["C", "33.7°C", "30°C", "21°C", "-10°C"],
  ] as const)("respects the saved %s preference", async (unit, neutral, minimum, resting, extreme) => {
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
    expect(screen.getByText(/Extremities lose heat/)).toHaveTextContent(`+2% per °C below ${extreme}`);
  });
});
