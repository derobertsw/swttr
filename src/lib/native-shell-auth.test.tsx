import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SignIn, SignUp } from "@clerk/nextjs";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { NATIVE_SHELL_AUTH_APPEARANCE } from "./native-shell";

const request = vi.hoisted(() => ({ userAgent: "Mozilla/5.0" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "swttr.vercel.app", "user-agent": request.userAgent }),
}));
vi.mock("@clerk/nextjs", () => ({ SignIn: vi.fn(() => null), SignUp: vi.fn(() => null) }));

describe("native shell auth pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["Mozilla/5.0", "Mozilla/5.0 SWTTRNativeTabs", "Mozilla/5.0 SWTTRNativeMac/1"])(
    "selects sign-in and sign-up appearance on the server for %s",
    async (userAgent) => {
      request.userAgent = userAgent;
      const searchParams = Promise.resolve({ redirect_url: "/?resume=packing" });
      render(await SignInPage({ searchParams }));
      render(await SignUpPage({ searchParams }));
      const signIn = vi.mocked(SignIn).mock.calls[0][0] as ComponentProps<typeof SignIn>;
      const signUp = vi.mocked(SignUp).mock.calls[0][0] as ComponentProps<typeof SignUp>;
      const native = userAgent !== "Mozilla/5.0";
      expect(signIn.appearance).toEqual(native ? NATIVE_SHELL_AUTH_APPEARANCE : undefined);
      expect(signUp.appearance).toEqual(native ? NATIVE_SHELL_AUTH_APPEARANCE : undefined);
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
