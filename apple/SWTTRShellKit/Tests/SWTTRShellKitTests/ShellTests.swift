import Foundation
import Testing
@testable import SWTTRShellKit

@Suite struct DestinationTests {
    @Test(arguments: ["/trips", "/trips/", "/trips/new", "/trips/abc/itinerary", "/trips/abc/packing"])
    func nestedTrips(path: String) { #expect(SWTTRDestination.matching(path: path) == .trips) }

    @Test func primaryDestinations() {
        #expect(SWTTRDestination.matching(path: "/") == .gearUp)
        #expect(SWTTRDestination.matching(path: "") == .gearUp)
        #expect(SWTTRDestination.matching(path: "/wardrobe") == .wardrobe)
        #expect(SWTTRDestination.matching(path: "/wardrobe/item") == .wardrobe)
        for path in ["/faq", "/sign-in", "/sign-up", "/tripster", "/trips-other", "/wardrobes"] {
            #expect(SWTTRDestination.matching(path: path) == nil)
        }
    }
}

@Suite struct NavigationTests {
    let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app", "localhost"])

    @Test func trustedHosts() {
        #expect(policy.isAllowedHost("SWTTR.VERCEL.APP"))
        #expect(policy.isAllowedHost("sub.swttr.vercel.app"))
        #expect(!policy.isAllowedHost("evilswttr.vercel.app"))
        #expect(!policy.isAllowedHost("swttr.vercel.app.evil.com"))
        #expect(!SWTTRNavigationPolicy(allowedHosts: [""]).isAllowedHost("example.com"))
    }

    @Test(arguments: ["clerk.com", "accounts.CLERK.COM", "clerk.dev", "swttr.clerk.accounts.dev"])
    func clerkHosts(host: String) { #expect(policy.isClerkHost(host)) }

    @Test func externalAuthDoesNotBypassHostCheck() {
        for value in ["https://accounts.google.com/oauth?redirect_url=x", "https://evil.com/sign-in", "https://notclerk.com/"] {
            #expect(policy.decide(targetURL: URL(string: value)!, isMainFrame: true) == .openExternal)
        }
    }

    @Test func framesAndNewWindows() {
        let app = URL(string: "https://swttr.vercel.app/trips/123")!
        let external = URL(string: "https://example.com/gear")!
        let clerk = URL(string: "https://accounts.clerk.com/verify")!
        #expect(policy.decide(targetURL: app, isMainFrame: true) == .allow)
        #expect(policy.decide(targetURL: app, isMainFrame: true, opensNewWindow: true) == .allow)
        #expect(policy.decide(targetURL: clerk, isMainFrame: true) == .allow)
        #expect(policy.decide(targetURL: external, isMainFrame: false) == .allow)
        #expect(policy.decide(targetURL: external, isMainFrame: false, opensNewWindow: true) == .openExternal)
        #expect(policy.decide(targetURL: external, isMainFrame: true) == .openExternal)
    }

    @Test(arguments: ["mailto:help@example.com", "tel:123", "sms:123", "maps://?q=Stowe"])
    func externalSchemes(value: String) {
        let url = URL(string: value)!
        #expect(policy.decide(targetURL: url, isMainFrame: true, userInitiated: true) == .openExternal)
        #expect(policy.decide(targetURL: url, isMainFrame: true) == .cancel)
        #expect(policy.decide(targetURL: url, isMainFrame: false, userInitiated: true) == .cancel)
        #expect(policy.decide(targetURL: url, isMainFrame: true, opensNewWindow: true,
                              userInitiated: true, sourceIsMainFrame: false) == .cancel)
    }

    @Test func unsafeSchemes() {
        for value in ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hello"] {
            #expect(policy.decide(targetURL: URL(string: value)!, isMainFrame: true) == .cancel)
        }
        #expect(policy.decide(targetURL: URL(string: "about:blank")!, isMainFrame: false) == .allow)
        #expect(policy.decide(targetURL: URL(string: "about:blank")!, isMainFrame: true, opensNewWindow: true) == .cancel)
        #expect(policy.decide(targetURL: URL(string: "about:srcdoc")!, isMainFrame: false) == .allow)
        #expect(policy.decide(targetURL: URL(string: "about:srcdoc")!, isMainFrame: true) == .cancel)
        #expect(policy.decide(targetURL: URL(string: "about:config")!, isMainFrame: true) == .cancel)
    }
}

@Suite struct ConfigTests {
    @Test func productionNeverUsesDebugURL() {
        let config = SWTTRShellConfig.resolve(info: ["SWTTRWebURLDebug": "http://localhost:9999"], isDebug: false)
        #expect(config.appURL.absoluteString == "https://swttr.vercel.app")
        #expect(config.allowedHosts == ["swttr.vercel.app"])
    }

    @Test func debugAndRemoteHosts() {
        let config = SWTTRShellConfig.resolve(info: ["SWTTRWebURL": "https://swttr.example", "SWTTRWebURLDebug": "http://127.0.0.1:3000"], isDebug: true)
        #expect(config.appURL.absoluteString == "http://127.0.0.1:3000")
        #expect(config.allowedHosts == ["127.0.0.1", "swttr.example"])
    }

    @Test(arguments: ["", "wardrobe", "file:///tmp/index.html", "http://swttr.example", "https://user:password@swttr.example"])
    func invalidRemoteUsesDefault(value: String) {
        #expect(SWTTRShellConfig.resolve(info: ["SWTTRWebURL": value], isDebug: false).remoteURL.absoluteString == "https://swttr.vercel.app")
    }

    @Test func debugHTTPIsLocalOnly() {
        let config = SWTTRShellConfig.resolve(info: ["SWTTRWebURLDebug": "http://evil.com"], isDebug: true)
        #expect(config.appURL.absoluteString == "http://localhost:3000")
    }

    @Test func ipv6LoopbackIsValidatedAndEligibleForFallback() {
        let config = SWTTRShellConfig.resolve(info: ["SWTTRWebURLDebug": "http://[::1]:3001"], isDebug: true)
        #expect(config.appURL.absoluteString == "http://[::1]:3001")
        #expect(SWTTRShellConfig.isLoopback(host: config.appURL.host))
        #expect(SWTTRShellConfig.isLoopback(host: "::1"))
        #expect(SWTTRShellConfig.isLoopback(host: "[::1]"))
        #expect(!SWTTRShellConfig.isLoopback(host: "localhost.evil.com"))
    }
}

@Suite struct RestorationTests {
    let base = URL(string: "https://swttr.vercel.app")!

    @Test func retainsDeepLinkAndOutingParameters() {
        for path in ["/trips/123/packing", "/wardrobe?from=outing", "/?mode=planAhead", "/faq#contact"] {
            let value = "https://swttr.vercel.app" + path
            #expect(SWTTRLastPage.restorableURL(value, baseURL: base)?.absoluteString == value)
        }
    }

    @Test func rejectsOtherOriginsAndCredentials() {
        for value in ["https://evil.com/trips", "https://accounts.clerk.com/", "http://swttr.vercel.app/", "https://swttr.vercel.app:444/", "https://user@swttr.vercel.app/"] {
            #expect(SWTTRLastPage.restorableURL(value, baseURL: base) == nil)
        }
        #expect(SWTTRLastPage.restorableURL("https://swttr.vercel.app:443/", baseURL: base) != nil)
        #expect(SWTTRLastPage.restorableURL(nil, baseURL: base) == nil)
        #expect(SWTTRLastPage.restorableURL("/trips", baseURL: base) == nil)
    }

    @Test(arguments: ["/sign-in", "/sign-in/verify", "/sign-up", "/sso-callback", "/oauth/callback", "/authenticate", "/trips/invite", "/trips/invite/secret", "/?__clerk_status=done", "/?code=secret", "/?redirect_url=/trips", "/?token=secret", "/?state=secret", "/?access_token=secret", "/?id_token=secret", "/?refreshToken=secret", "/?%61ccess_token=secret", "/#access_token=secret", "/#id_token=secret", "/#access_token%3Dsecret", "/#/callback?access_token=secret"])
    func doesNotRestoreAuth(path: String) {
        #expect(SWTTRLastPage.restorableURL("https://swttr.vercel.app" + path, baseURL: base) == nil)
    }
}

@Suite struct ProcessRecoveryTests {
    @Test func crashLoopRequiresExplicitRetry() {
        var recovery = SWTTRProcessRecovery()
        let first = recovery.shouldReload(now: 100)
        let repeated = recovery.shouldReload(now: 101)
        let withinWindow = recovery.shouldReload(now: 129)
        let nextWindow = recovery.shouldReload(now: 130)
        let repeatedAgain = recovery.shouldReload(now: 131)
        #expect(first)
        #expect(!repeated)
        #expect(!withinWindow)
        #expect(nextWindow)
        #expect(!repeatedAgain)
        recovery.reset()
        let explicitRetry = recovery.shouldReload(now: 132)
        #expect(explicitRetry)
    }
}

@Suite struct LoadFailureTests {
    @Test func cancelledNavigationsDoNotShowOfflineScreen() {
        #expect(SWTTRLoadFailure.classify(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)) == .cancelled)
        #expect(SWTTRLoadFailure.classify(NSError(domain: "WebKitErrorDomain", code: 102)) == .cancelled)
        #expect(SWTTRLoadFailure.classify(NSError(domain: "OtherError", code: 102)) == .other)
    }

    @Test(arguments: [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorCannotFindHost,
                      NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost])
    func networkErrorsPermitDebugFallback(code: Int) {
        #expect(SWTTRLoadFailure.classify(NSError(domain: NSURLErrorDomain, code: code)) == .network)
    }

    @Test func tlsErrorsDoNotSilentlyFallBack() {
        #expect(SWTTRLoadFailure.classify(NSError(domain: NSURLErrorDomain, code: NSURLErrorServerCertificateUntrusted)) == .other)
    }
}
