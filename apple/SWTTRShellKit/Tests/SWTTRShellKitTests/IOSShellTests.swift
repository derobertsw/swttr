import Foundation
import Testing
@testable import SWTTRShellKit

// Ported one-for-one from the iOS shell's XCTest file
// (ios/App/AppTests/SWTTRTests.swift), which was never attached to a target.
// The iOS shell's `isAuthFlowURL` only ever widened `decide` for hosts that
// `decide` already allows, so the shared policy doesn't have it. Those cases
// assert the same outcome through `decide`, the call the shell makes.

@Suite struct IOSNavigationPolicyTests {
    let app: Set<String> = ["swttr.vercel.app"]

    private func decide(_ value: String, allowedHosts: Set<String>, isMainFrame: Bool = true) -> SWTTRNavigationPolicy.Decision {
        SWTTRNavigationPolicy(allowedHosts: allowedHosts).decide(targetURL: URL(string: value)!, isMainFrame: isMainFrame)
    }

    // MARK: isAllowedHost

    @Test func allowedHostExactMatch() {
        #expect(SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"]).isAllowedHost("swttr.vercel.app"))
    }

    @Test func allowedHostSubdomainMatch() {
        #expect(SWTTRNavigationPolicy(allowedHosts: ["vercel.app"]).isAllowedHost("swttr.vercel.app"))
    }

    @Test func allowedHostRejectsUnknown() {
        #expect(!SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"]).isAllowedHost("evil.com"))
    }

    @Test func allowedHostRejectsPartialSuffix() {
        // "notapp.com" ends with "app.com" but is not a subdomain.
        #expect(!SWTTRNavigationPolicy(allowedHosts: ["app.com"]).isAllowedHost("notapp.com"))
    }

    @Test func allowedHostLocalhostMatch() {
        #expect(SWTTRNavigationPolicy(allowedHosts: ["localhost", "swttr.vercel.app"]).isAllowedHost("localhost"))
    }

    @Test func allowedHostEmptySet() {
        #expect(!SWTTRNavigationPolicy(allowedHosts: []).isAllowedHost("anything.com"))
    }

    // MARK: isClerkHost

    @Test func clerkComExact() {
        #expect(SWTTRNavigationPolicy(allowedHosts: []).isClerkHost("clerk.com"))
    }

    @Test func clerkComSubdomain() {
        #expect(SWTTRNavigationPolicy(allowedHosts: []).isClerkHost("accounts.clerk.com"))
    }

    @Test func clerkDevExact() {
        #expect(SWTTRNavigationPolicy(allowedHosts: []).isClerkHost("clerk.dev"))
    }

    @Test func clerkAccountsDev() {
        #expect(SWTTRNavigationPolicy(allowedHosts: []).isClerkHost("swttr.clerk.accounts.dev"))
    }

    @Test func clerkHostCaseInsensitive() {
        #expect(SWTTRNavigationPolicy(allowedHosts: []).isClerkHost("Accounts.CLERK.COM"))
    }

    @Test func nonClerkHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        #expect(!policy.isClerkHost("notclerk.com"))
        #expect(!policy.isClerkHost("evil-clerk.com"))
    }

    // MARK: Auth flows (were isAuthFlowURL)

    @Test func authFlowSignInPath() {
        #expect(decide("https://swttr.vercel.app/sign-in", allowedHosts: app) == .allow)
    }

    @Test func authFlowSignUpPath() {
        #expect(decide("https://swttr.vercel.app/sign-up", allowedHosts: app) == .allow)
    }

    @Test func authFlowSSOCallbackPath() {
        #expect(decide("https://swttr.vercel.app/sso-callback?code=abc", allowedHosts: app) == .allow)
    }

    @Test func authFlowOAuthPathOnUntrustedHost() {
        // Auth-like paths on untrusted hosts must not load in the web view.
        #expect(decide("https://accounts.google.com/oauth/v2/auth", allowedHosts: app) == .openExternal)
    }

    @Test func authFlowOAuthPathOnUntrustedHostWithEmptyAllowlist() {
        #expect(decide("https://evil.com/oauth/callback", allowedHosts: []) == .openExternal)
    }

    @Test func authFlowClerkQuery() {
        #expect(decide("https://swttr.vercel.app/?__clerk_status=done", allowedHosts: app) == .allow)
    }

    @Test func authFlowClerkHost() {
        // Clerk hosts are always allowed, whatever the allowed hosts are.
        #expect(decide("https://accounts.clerk.com/v1/verify", allowedHosts: []) == .allow)
    }

    @Test func nonAuthFlowURL() {
        #expect(decide("https://evil.com/phishing", allowedHosts: []) == .openExternal)
    }

    // MARK: decide

    @Test func decideAllowsAppHost() {
        #expect(decide("https://swttr.vercel.app/wardrobe", allowedHosts: app) == .allow)
    }

    @Test func decideAllowsClerkHost() {
        #expect(decide("https://accounts.clerk.com/v1/sessions", allowedHosts: app) == .allow)
    }

    @Test func decideBlocksAuthLikeURLOnUntrustedHost() {
        #expect(decide("https://accounts.google.com/oauth/v2/auth?redirect_url=x", allowedHosts: app) == .openExternal)
    }

    @Test func decideAllowsAuthFlowOnClerkHost() {
        #expect(decide("https://accounts.clerk.com/oauth/callback", allowedHosts: app) == .allow)
    }

    @Test func decideBlocksUntrustedMainFrame() {
        #expect(decide("https://evil.com/phishing", allowedHosts: app) == .openExternal)
    }

    @Test func decideAllowsUntrustedNonMainFrame() {
        #expect(decide("https://cdn.analytics.com/script.js", allowedHosts: app, isMainFrame: false) == .allow)
    }

    @Test func decideAllowsURLWithoutHost() {
        #expect(decide("about:blank", allowedHosts: app) == .allow)
    }

    /// Regression: being on an auth page must not allow navigating to untrusted
    /// hosts. Old code used `currentURLIsAuthFlow` to bypass the host check.
    @Test func decideDoesNotAllowUntrustedHostDuringAuthFlow() {
        #expect(decide("https://evil.com/steal-tokens", allowedHosts: app) == .openExternal)
    }
}

@Suite struct PulseTrackerTests {
    @Test func pulsesOnFirstUserActivityChange() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                         eventID: "ev-1", userInitiated: true, now: 100)
        #expect(result)
    }

    @Test func rejectsNonActivityChangeSource() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(activityValue: "running", source: "bootstrap",
                                         eventID: nil, userInitiated: true, now: 100)
        #expect(!result)
    }

    @Test func rejectsNonUserInitiated() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(activityValue: "running", source: "activityChange",
                                         eventID: "ev-1", userInitiated: false, now: 100)
        #expect(!result)
    }

    @Test func deduplicatesSameEventID() {
        var tracker = SWTTRPulseTracker()
        let first = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                        eventID: "ev-1", userInitiated: true, now: 100)
        let second = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                         eventID: "ev-1", userInitiated: true, now: 100.05)
        #expect(first)
        #expect(!second)
    }

    @Test func deduplicatesSameValueWithinCooldown() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                eventID: "ev-1", userInitiated: true, now: 100)
        // Same value, different event ID, within the 1.1s cooldown.
        let result = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                         eventID: "ev-2", userInitiated: true, now: 100.5)
        #expect(!result)
    }

    @Test func allowsDifferentValueWithDifferentEventID() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                eventID: "ev-1", userInitiated: true, now: 100)
        let result = tracker.shouldPulse(activityValue: "running", source: "activityChange",
                                         eventID: "ev-2", userInitiated: true, now: 100.2)
        #expect(result)
    }

    @Test func allowsSameValueAfterCooldownExpires() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                eventID: "ev-1", userInitiated: true, now: 100)
        let result = tracker.shouldPulse(activityValue: "xc_skiing", source: "activityChange",
                                         eventID: "ev-3", userInitiated: true, now: 101.2) // > 1.1s after 100
        #expect(result)
    }

    @Test func nilEventIDStillDeduplicatesByValueCooldown() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(activityValue: "biking", source: "activityChange",
                                eventID: nil, userInitiated: true, now: 100)
        let result = tracker.shouldPulse(activityValue: "biking", source: "activityChange",
                                         eventID: nil, userInitiated: true, now: 100.3)
        #expect(!result)
    }

    @Test func emptyEventIDTreatedAsNil() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(activityValue: "running", source: "activityChange",
                                eventID: "", userInitiated: true, now: 100)
        // An empty ID is normalized to nil, so only the value cooldown applies.
        let result = tracker.shouldPulse(activityValue: "running", source: "activityChange",
                                         eventID: "", userInitiated: true, now: 100.2)
        #expect(!result)
    }
}

@Suite struct IOSShellConfigTests {
    // The shell's committed Info.plist values resolve to the same URLs the old
    // iOS-only resolver produced.
    let info: [String: Any] = ["SWTTRWebURL": "https://swttr.vercel.app", "SWTTRWebURLDebug": "http://localhost:3000"]

    @Test func releaseLoadsRemoteSite() {
        let config = SWTTRShellConfig.resolve(info: info, isDebug: false)
        #expect(config.appURL.absoluteString == "https://swttr.vercel.app")
        #expect(config.remoteURL.absoluteString == "https://swttr.vercel.app")
        #expect(config.allowedHosts == ["swttr.vercel.app"])
    }

    @Test func debugLoadsLocalDevServer() {
        let config = SWTTRShellConfig.resolve(info: info, isDebug: true)
        #expect(config.appURL.absoluteString == "http://localhost:3000")
        #expect(config.remoteURL.absoluteString == "https://swttr.vercel.app")
        #expect(config.allowedHosts == ["localhost", "swttr.vercel.app"])
    }

    @Test func missingValuesUseDefaults() {
        #expect(SWTTRShellConfig.resolve(info: [:], isDebug: false).appURL.absoluteString == "https://swttr.vercel.app")
        #expect(SWTTRShellConfig.resolve(info: [:], isDebug: true).appURL.absoluteString == "http://localhost:3000")
    }
}
