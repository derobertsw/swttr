import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineBriefAccountGuard } from "@/components/OfflineBriefAccountGuard";
import { storeSavedBrief } from "@/lib/offline-briefs";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";
import { offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);

describe("The start page's redirect worker for briefs already saved (#214)", () => {
  let register: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetDeviceStorage();
    resetFakeClerk();
    register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register, getRegistrations: async () => [] } });
  });
  afterEach(() => { Reflect.deleteProperty(navigator, "serviceWorker"); });

  it("is registered on any page once Clerk says the briefs' own account is signed in", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    await act(async () => { render(<OfflineBriefAccountGuard />); });
    expect(register).toHaveBeenCalledWith("/offline-start-sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("isn't registered with nothing saved, for another account's briefs, or before Clerk loads", async () => {
    const guard = async () => {
      const { unmount } = render(<OfflineBriefAccountGuard />);
      await act(async () => undefined);
      unmount();
    };
    await guard();
    resetDeviceStorage();
    await storeSavedBrief("user_2", offlineBrief({ viewer: { user_id: "user_2", member_id: "m-2" } }));
    await guard();
    resetDeviceStorage();
    await storeSavedBrief("user_1", offlineBrief());
    fakeClerkState.loaded = false;
    await guard();
    expect(register).not.toHaveBeenCalled();
  });
});
