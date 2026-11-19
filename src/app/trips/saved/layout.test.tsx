import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SavedBriefsLayout, { metadata } from "./layout";

describe("Saved on this device's page title (#214)", () => {
  it("names the page, so a bookmark or the browser's history finds it with no connection", () => {
    // With the root layout's "%s | SWTTR" template: "Saved on this device | SWTTR".
    expect(metadata.title).toBe("Saved on this device");
    render(<SavedBriefsLayout><p>Saved trips</p></SavedBriefsLayout>);
    expect(screen.getByText("Saved trips")).toBeInTheDocument();
  });
});
