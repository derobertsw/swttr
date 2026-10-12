import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { PreferenceSaveResult } from "@/types/preferences";

/** A save that finishes when the test says so. */
function heldSave() {
  let finish: (result: PreferenceSaveResult) => void = () => {};
  const promise = new Promise<PreferenceSaveResult>((resolve) => (finish = resolve));
  return { promise, finish };
}

describe("PreferencesDrawer", () => {
  const defaultProps = {
    sensitivity: "neutral" as const,
    defaultActivity: "alpine_skiing",
    heightInches: 69,
    weightLbs: 170,
    onSensitivityChange: vi.fn(),
    onDefaultActivityChange: vi.fn(),
    onBodyMetricsChange: vi.fn(),
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
        expect(screen.getByText("Settings")).toBeInTheDocument();
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
        expect(screen.getByText(/pre-selected each time you open swttr/i)).toBeInTheDocument();
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
        expect(screen.getByText("Balanced recommendations for most people.")).toBeInTheDocument();
      });
    });

    it("should show sensitivity description for hot", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} sensitivity="hot" />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("You run warm. We bias toward lighter layers.")).toBeInTheDocument();
      });
    });

    it("should show sensitivity description for cold", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} sensitivity="cold" />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("You run cold. We bias toward warmer layers.")).toBeInTheDocument();
      });
    });
  });

  describe("body metrics selectors", () => {
    it("should show height and weight labels", async () => {
      const user = userEvent.setup();
      render(<PreferencesDrawer {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Height (ft/in)")).toBeInTheDocument();
        expect(screen.getByText("Weight (lb)")).toBeInTheDocument();
      });
    });

    it("should allow unpopulated height and weight selectors", async () => {
      const user = userEvent.setup();
      render(
        <PreferencesDrawer
          {...defaultProps}
          heightInches={undefined}
          weightLbs={undefined}
        />
      );

      await user.click(screen.getByRole("button", { name: /open preferences/i }));

      await waitFor(() => {
        expect(screen.getByText("Height")).toBeInTheDocument();
        expect(screen.getByText("Weight")).toBeInTheDocument();
      });
    });
  });

  describe("save status", () => {
    // Vaul's drag handling reads CSS transforms, which jsdom lacks, so clicks
    // inside the drawer are plain click events.
    it("says when the account couldn't save a change instead of Saved, until the next change", async () => {
      const onSensitivityChange = vi.fn().mockResolvedValue("kept-on-device");
      render(<PreferencesDrawer {...defaultProps} onSensitivityChange={onSensitivityChange} open />);

      fireEvent.click(screen.getByRole("radio", { name: "Run Warm" }));
      expect(await screen.findByText(/Couldn’t save to your account\. It’s kept on this device/)).toBeInTheDocument();
      expect(screen.queryByText("Changes save automatically.")).not.toBeInTheDocument();
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();

      onSensitivityChange.mockResolvedValue("saved");
      fireEvent.click(screen.getByRole("radio", { name: "Run Cold" }));
      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();
      expect(screen.queryByText(/Couldn’t save to your account/)).not.toBeInTheDocument();
    });

    it("says when nothing could keep a change, not even this device", async () => {
      render(<PreferencesDrawer {...defaultProps} onSensitivityChange={vi.fn().mockResolvedValue("not-saved")} open />);

      fireEvent.click(screen.getByRole("radio", { name: "Run Warm" }));
      expect(
        await screen.findByText("Couldn’t save this change. It only lasts until the page reloads.")
      ).toBeInTheDocument();
      expect(screen.queryByText("Changes save automatically.")).not.toBeInTheDocument();
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    });

    it("clears the couldn't-save notice when the drawer closes", async () => {
      const onOpenChange = vi.fn();
      render(
        <PreferencesDrawer
          {...defaultProps}
          onSensitivityChange={vi.fn().mockResolvedValue("kept-on-device")}
          open
          onOpenChange={onOpenChange}
        />
      );

      fireEvent.click(screen.getByRole("radio", { name: "Run Warm" }));
      expect(await screen.findByText(/Couldn’t save to your account/)).toBeInTheDocument();

      // Still open here, because the parent keeps `open` set.
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/Couldn’t save to your account/)).not.toBeInTheDocument();
      expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();
    });

    it("ignores a save that finishes after the drawer closed", async () => {
      const save = heldSave();
      render(
        <PreferencesDrawer {...defaultProps} onSensitivityChange={() => save.promise} open onOpenChange={vi.fn()} />
      );

      fireEvent.click(screen.getByRole("radio", { name: "Run Warm" }));
      expect(screen.getByText("Saving...")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.queryByText("Saving...")).not.toBeInTheDocument();

      await act(async () => save.finish("kept-on-device"));
      expect(screen.queryByText(/Couldn’t save to your account/)).not.toBeInTheDocument();
      expect(screen.getByText("Changes save automatically.")).toBeInTheDocument();
    });

    it("shows the latest change's result when an earlier save finishes after it", async () => {
      const saves = [heldSave(), heldSave()];
      const onSensitivityChange = vi
        .fn()
        .mockReturnValueOnce(saves[0].promise)
        .mockReturnValueOnce(saves[1].promise);
      render(<PreferencesDrawer {...defaultProps} onSensitivityChange={onSensitivityChange} open />);

      fireEvent.click(screen.getByRole("radio", { name: "Run Warm" }));
      fireEvent.click(screen.getByRole("radio", { name: "Run Cold" }));
      await act(async () => saves[1].finish("saved"));
      expect(screen.getByText("Saved")).toBeInTheDocument();

      await act(async () => saves[0].finish("kept-on-device"));
      expect(screen.getByText("Saved")).toBeInTheDocument();
      expect(screen.queryByText(/Couldn’t save to your account/)).not.toBeInTheDocument();
    });
  });

  describe("controlled open state", () => {
    it("should be open when open prop is true", () => {
      render(<PreferencesDrawer {...defaultProps} open={true} />);
      expect(screen.getByText("Settings")).toBeInTheDocument();
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
