import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignIn, SignUp } from "@clerk/nextjs";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { AUTH_CARD_APPEARANCE } from "@/lib/clerk-appearance";
import { NATIVE_SHELL_AUTH_APPEARANCE } from "@/lib/native-shell";

const request = vi.hoisted(() => ({ userAgent: "Mozilla/5.0" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "swttr.vercel.app", "user-agent": request.userAgent }),
}));
vi.mock("@clerk/nextjs", () => ({
  SignIn: vi.fn(() => <h1>Sign in</h1>),
  SignUp: vi.fn(() => <h1>Create your account</h1>),
}));
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("native shell auth pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each card inside the app's page layout", async () => {
    const searchParams = Promise.resolve({});
    const { unmount } = render(await SignInPage({ searchParams }));
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Sign in" }));
    unmount();
    render(await SignUpPage({ searchParams }));
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Create your account" }));
  });

  it("leaves the elements the native shell hides to the provider's appearance", () => {
    // Clerk applies a card's appearance over the provider's, element by element.
    for (const element of Object.keys(NATIVE_SHELL_AUTH_APPEARANCE.elements)) {
      expect(AUTH_CARD_APPEARANCE.elements).not.toHaveProperty(element);
    }
  });

  it.each(["Mozilla/5.0", "Mozilla/5.0 SWTTRNativeTabs", "Mozilla/5.0 SWTTRNativeMac/1"])(
    "preserves local auth returns and styles the card for %s",
    async (userAgent) => {
      request.userAgent = userAgent;
      const searchParams = Promise.resolve({ redirect_url: "/?resume=packing" });
      render(await SignInPage({ searchParams }));
      render(await SignUpPage({ searchParams }));
      const signIn = vi.mocked(SignIn).mock.calls[0][0] as ComponentProps<typeof SignIn>;
      const signUp = vi.mocked(SignUp).mock.calls[0][0] as ComponentProps<typeof SignUp>;
      const native = userAgent !== "Mozilla/5.0";
      expect(signIn.appearance).toBe(AUTH_CARD_APPEARANCE);
      expect(signUp.appearance).toBe(AUTH_CARD_APPEARANCE);
      expect(signIn.forceRedirectUrl).toBe("/?resume=packing");
      expect(signIn.signUpForceRedirectUrl).toBe("/?resume=packing");
      expect(signUp.forceRedirectUrl).toBe("/?resume=packing");
      expect(signUp.signInForceRedirectUrl).toBe("/?resume=packing");
      expect(signIn.signUpUrl).toBe(native ? "/sign-up?redirect_url=%2F%3Fresume%3Dpacking" : undefined);
      expect(signUp.signInUrl).toBe(native ? "/sign-in?redirect_url=%2F%3Fresume%3Dpacking" : undefined);
    }
  );

  it.each(["https://evil.example/wardrobe", "//evil.example/wardrobe", "/sign-in", "/api/preferences"])(
    "keeps rejecting unsafe native auth return destinations: %s",
    async (redirect_url) => {
      request.userAgent = "SWTTRNativeMac/1";
      const searchParams = Promise.resolve({ redirect_url });
      render(await SignInPage({ searchParams }));
      render(await SignUpPage({ searchParams }));
      expect(vi.mocked(SignIn).mock.calls[0][0].forceRedirectUrl).toBe("/");
      expect(vi.mocked(SignUp).mock.calls[0][0].forceRedirectUrl).toBe("/");
    }
  );
});
