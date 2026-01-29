import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivitySelection from "./ActivitySelection";

describe("ActivitySelection", () => {
  describe("rendering", () => {
    it("should render the select trigger", () => {
      render(<ActivitySelection value="" onChange={vi.fn()} />);
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("should show placeholder when no value selected", () => {
      render(<ActivitySelection value="" onChange={vi.fn()} />);
      expect(screen.getByText("Select an activity")).toBeInTheDocument();
    });

    it("should show selected activity value", () => {
      render(<ActivitySelection value="alpine-skiing" onChange={vi.fn()} />);
      expect(screen.getByText("Alpine Skiing")).toBeInTheDocument();
    });
  });

  describe("activity options", () => {
    it("should show Alpine Skiing option when opened", async () => {
      const user = userEvent.setup();
      render(<ActivitySelection value="" onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));

      // Wait for the dropdown to appear
      const alpineOption = await screen.findByRole("option", { name: /alpine skiing/i });
      expect(alpineOption).toBeInTheDocument();
    });

    it("should show XC Skiing option when opened", async () => {
      const user = userEvent.setup();
      render(<ActivitySelection value="" onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));

      const xcOption = await screen.findByRole("option", { name: /xc skiing/i });
      expect(xcOption).toBeInTheDocument();
    });
  });

  describe("interaction", () => {
    it("should call onChange when an activity is selected", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      render(<ActivitySelection value="" onChange={mockOnChange} />);

      await user.click(screen.getByRole("combobox"));
      const alpineOption = await screen.findByRole("option", { name: /alpine skiing/i });
      await user.click(alpineOption);

      expect(mockOnChange).toHaveBeenCalledWith("alpine-skiing");
    });

    it("should call onChange with xc-skiing when XC Skiing is selected", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      render(<ActivitySelection value="" onChange={mockOnChange} />);

      await user.click(screen.getByRole("combobox"));
      const xcOption = await screen.findByRole("option", { name: /xc skiing/i });
      await user.click(xcOption);

      expect(mockOnChange).toHaveBeenCalledWith("xc-skiing");
    });
  });

  describe("controlled component", () => {
    it("should reflect value prop changes", () => {
      const { rerender } = render(
        <ActivitySelection value="" onChange={vi.fn()} />
      );
      expect(screen.getByText("Select an activity")).toBeInTheDocument();

      rerender(<ActivitySelection value="alpine-skiing" onChange={vi.fn()} />);
      expect(screen.getByText("Alpine Skiing")).toBeInTheDocument();

      rerender(<ActivitySelection value="xc-skiing" onChange={vi.fn()} />);
      expect(screen.getByText("XC Skiing")).toBeInTheDocument();
    });
  });
});
