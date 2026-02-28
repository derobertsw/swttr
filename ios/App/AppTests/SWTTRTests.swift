import XCTest
@testable import App

final class SWTTRNavigationPolicyTests: XCTestCase {

    // MARK: - isAllowedHost

    func testAllowedHostExactMatch() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        XCTAssertTrue(policy.isAllowedHost("swttr.vercel.app"))
    }

    func testAllowedHostSubdomainMatch() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["vercel.app"])
        XCTAssertTrue(policy.isAllowedHost("swttr.vercel.app"))
    }

    func testAllowedHostRejectsUnknown() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        XCTAssertFalse(policy.isAllowedHost("evil.com"))
    }

    func testAllowedHostRejectsPartialSuffix() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["app.com"])
        // "notapp.com" ends with "app.com" but is not a subdomain
        XCTAssertFalse(policy.isAllowedHost("notapp.com"))
    }

    func testAllowedHostLocalhostMatch() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["localhost", "swttr.vercel.app"])
        XCTAssertTrue(policy.isAllowedHost("localhost"))
    }

    func testAllowedHostEmptySet() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertFalse(policy.isAllowedHost("anything.com"))
    }

    // MARK: - isClerkHost

    func testClerkComExact() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertTrue(policy.isClerkHost("clerk.com"))
    }

    func testClerkComSubdomain() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertTrue(policy.isClerkHost("accounts.clerk.com"))
    }

    func testClerkDevExact() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertTrue(policy.isClerkHost("clerk.dev"))
    }

    func testClerkAccountsDev() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertTrue(policy.isClerkHost("swttr.clerk.accounts.dev"))
    }

    func testClerkHostCaseInsensitive() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertTrue(policy.isClerkHost("Accounts.CLERK.COM"))
    }

    func testNonClerkHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        XCTAssertFalse(policy.isClerkHost("notclerk.com"))
        XCTAssertFalse(policy.isClerkHost("evil-clerk.com"))
    }

    // MARK: - isAuthFlowURL

    func testAuthFlowSignInPath() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://swttr.vercel.app/sign-in")!
        XCTAssertTrue(policy.isAuthFlowURL(url))
    }

    func testAuthFlowSignUpPath() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://swttr.vercel.app/sign-up")!
        XCTAssertTrue(policy.isAuthFlowURL(url))
    }

    func testAuthFlowSSOCallbackPath() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://swttr.vercel.app/sso-callback?code=abc")!
        XCTAssertTrue(policy.isAuthFlowURL(url))
    }

    func testAuthFlowOAuthPathOnUntrustedHost() {
        // Auth-like paths on untrusted hosts must NOT be allowed
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://accounts.google.com/oauth/v2/auth")!
        XCTAssertFalse(policy.isAuthFlowURL(url))
    }

    func testAuthFlowOAuthPathOnUntrustedHostWithEmptyAllowlist() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        let url = URL(string: "https://evil.com/oauth/callback")!
        XCTAssertFalse(policy.isAuthFlowURL(url))
    }

    func testAuthFlowClerkQuery() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://swttr.vercel.app/?__clerk_status=done")!
        XCTAssertTrue(policy.isAuthFlowURL(url))
    }

    func testAuthFlowClerkHost() {
        // Clerk hosts are always allowed regardless of allowedHosts
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        let url = URL(string: "https://accounts.clerk.com/v1/verify")!
        XCTAssertTrue(policy.isAuthFlowURL(url))
    }

    func testNonAuthFlowURL() {
        let policy = SWTTRNavigationPolicy(allowedHosts: [])
        let url = URL(string: "https://evil.com/phishing")!
        XCTAssertFalse(policy.isAuthFlowURL(url))
    }

    // MARK: - decide (combined navigation policy)

    func testDecideAllowsAppHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://swttr.vercel.app/wardrobe")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .allow)
    }

    func testDecideAllowsClerkHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://accounts.clerk.com/v1/sessions")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .allow)
    }

    func testDecideBlocksAuthLikeURLOnUntrustedHost() {
        // Auth-like paths on untrusted hosts must NOT be allowed in-webview
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://accounts.google.com/oauth/v2/auth?redirect_url=x")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .openExternal)
    }

    func testDecideAllowsAuthFlowOnClerkHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://accounts.clerk.com/oauth/callback")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .allow)
    }

    func testDecideBlocksUntrustedMainFrame() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://evil.com/phishing")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .openExternal)
    }

    func testDecideAllowsUntrustedNonMainFrame() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "https://cdn.analytics.com/script.js")!
        let decision = policy.decide(targetURL: url, isMainFrame: false)
        XCTAssertEqual(decision, .allow)
    }

    func testDecideAllowsURLWithoutHost() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        let url = URL(string: "about:blank")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .allow)
    }

    /// Regression: being on an auth page must NOT allow navigating to untrusted hosts.
    /// The old code used `currentURLIsAuthFlow` to bypass the host check.
    func testDecideDoesNotAllowUntrustedHostDuringAuthFlow() {
        let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])
        // Even if we're conceptually "in an auth flow", navigating to an untrusted
        // host that isn't itself an auth URL should be blocked.
        let url = URL(string: "https://evil.com/steal-tokens")!
        let decision = policy.decide(targetURL: url, isMainFrame: true)
        XCTAssertEqual(decision, .openExternal)
    }
}

// MARK: - Pulse tracker tests

final class SWTTRPulseTrackerTests: XCTestCase {

    func testPulsesOnFirstUserActivityChange() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100
        )
        XCTAssertTrue(result)
    }

    func testRejectsNonActivityChangeSource() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(
            activityValue: "running",
            source: "bootstrap",
            eventID: nil,
            userInitiated: true,
            now: 100
        )
        XCTAssertFalse(result)
    }

    func testRejectsNonUserInitiated() {
        var tracker = SWTTRPulseTracker()
        let result = tracker.shouldPulse(
            activityValue: "running",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: false,
            now: 100
        )
        XCTAssertFalse(result)
    }

    func testDeduplicatesSameEventID() {
        var tracker = SWTTRPulseTracker()
        let first = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100
        )
        XCTAssertTrue(first)

        let second = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100.05
        )
        XCTAssertFalse(second)
    }

    func testDeduplicatesSameValueWithinCooldown() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100
        )

        // Same value, different eventID, within 1.1s cooldown
        let result = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-2",
            userInitiated: true,
            now: 100.5
        )
        XCTAssertFalse(result)
    }

    func testAllowsDifferentValueWithDifferentEventID() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100
        )

        let result = tracker.shouldPulse(
            activityValue: "running",
            source: "activityChange",
            eventID: "ev-2",
            userInitiated: true,
            now: 100.2
        )
        XCTAssertTrue(result)
    }

    func testAllowsSameValueAfterCooldownExpires() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-1",
            userInitiated: true,
            now: 100
        )

        let result = tracker.shouldPulse(
            activityValue: "xc_skiing",
            source: "activityChange",
            eventID: "ev-3",
            userInitiated: true,
            now: 101.2 // > 1.1s after 100
        )
        XCTAssertTrue(result)
    }

    func testNilEventIDStillDeduplicatesByValueCooldown() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(
            activityValue: "biking",
            source: "activityChange",
            eventID: nil,
            userInitiated: true,
            now: 100
        )

        let result = tracker.shouldPulse(
            activityValue: "biking",
            source: "activityChange",
            eventID: nil,
            userInitiated: true,
            now: 100.3
        )
        XCTAssertFalse(result)
    }

    func testEmptyEventIDTreatedAsNil() {
        var tracker = SWTTRPulseTracker()
        _ = tracker.shouldPulse(
            activityValue: "running",
            source: "activityChange",
            eventID: "",
            userInitiated: true,
            now: 100
        )

        // Empty string should be normalized to nil, so no eventID dedup —
        // but value cooldown should still apply
        let result = tracker.shouldPulse(
            activityValue: "running",
            source: "activityChange",
            eventID: "",
            userInitiated: true,
            now: 100.2
        )
        XCTAssertFalse(result)
    }
}

// MARK: - Equatable conformance for test assertions

extension SWTTRNavigationPolicy.NavigationDecision: Equatable {}
