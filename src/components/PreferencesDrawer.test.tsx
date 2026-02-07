import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesDrawer } from "./PreferencesDrawer";

describe("PreferencesDrawer", () => {
  const defaultProps = {
    sensitivity: "neutral" as const,
    defaultActivity: "alpine_skiing",
    onSensitivityChange: vi.fn(),
    onDefaultActivityChange: vi.fn(),
    children: <button>Open Preferences</button>,
  };

  describe("rendering", () => {
    it("should render trigger element", () => {
      render(<PreferencesDrawer {...defaultProps} />);
      expect(screen.getByRole("button", { name: /open preferences/i })).toBeInTheDocument();
    });

    it("should open drawer when trigger is clicked", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Preferences")).toBeInTheDocument();
      });
    });

    it("should show description in drawer", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText(/customize your recommendations/i)).toBeInTheDocument();
      });
    });
  });

  describe("default activity selector", () => {
    it("should show Default Activity label", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Default Activity")).toBeInTheDocument();
      });
    });

    it("should show activity description", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText(/this will be pre-selected/i)).toBeInTheDocument();
      });
    });
  });

  describe("temperature sensitivity selector", () => {
    it("should show Temperature Sensitivity label", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Temperature Sensitivity")).toBeInTheDocument();
      });
    });

    it("should show sensitivity description for neutral", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} sensitivity="neutral" />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Standard recommendations")).toBeInTheDocument();
      });
    });

    it("should show sensitivity description for hot", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} sensitivity="hot" />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Recommend lighter gear")).toBeInTheDocument();
      });
    });

    it("should show sensitivity description for cold", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} sensitivity="cold" />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Recommend warmer gear")).toBeInTheDocument();
      });
    });
  });

  describe("controlled open state", () => {
    it("should be open when open prop is true", () => {
      render(<PreferencesDrawer {...defaultProps} open={true} />);
      expect(screen.getByText("Preferences")).toBeInTheDocument();
    });

    it("should call onOpenChange when drawer state changes", async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });
});
