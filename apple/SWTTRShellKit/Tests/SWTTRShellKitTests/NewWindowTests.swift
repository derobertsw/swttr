import Foundation
import Testing
@testable import SWTTRShellKit

/// #146: new windows (`target="_blank"`, `window.open`) and links with schemes
/// other than HTTP(S), as the iOS and Mac shells call `decide` for them. A new
/// window has no target frame, so the shells pass `isMainFrame: true`.
@Suite struct NewWindowTests {
    let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app"])

    private func newWindow(_ value: String, tapped: Bool = true,
                           fromMainFrame: Bool = true) -> SWTTRNavigationPolicy.Decision {
        policy.decide(targetURL: URL(string: value)!, isMainFrame: true, opensNewWindow: true,
                      userInitiated: tapped, sourceIsMainFrame: fromMainFrame)
    }

    @Test(arguments: ["https://swttr.vercel.app/feedback", "https://swttr.vercel.app/trips/abc?tab=packing",
                      "https://accounts.clerk.com/v1/verify"])
    func trustedNewWindowsLoadInPlace(value: String) {
        // `.allow` for a new window means "load it in this web view": the
        // shells create no second web view.
        #expect(newWindow(value) == .allow)
        #expect(newWindow(value, tapped: false) == .allow)
    }

    @Test(arguments: ["https://forms.gle/feedback", "https://www.rei.com/product/123",
                      "http://example.com/gear", "https://accounts.google.com/o/oauth2/auth"])
    func externalNewWindowsOpenInSafariSheet(value: String) {
        #expect(newWindow(value) == .openExternal)
        #expect(SWTTRExternalOpener.forURL(URL(string: value)!) == .safariSheet)
    }

    @Test(arguments: ["mailto:hello@swttr.app?subject=Feedback", "tel:+18025551234", "sms:+18025551234&body=Hi",
                      "maps://?q=Stowe", "MAILTO:caps@example.com"])
    func otherSchemesOpenTheSystemHandler(value: String) {
        let url = URL(string: value)!
        // A tapped link, in place or in a new window.
        #expect(policy.decide(targetURL: url, isMainFrame: true, userInitiated: true) == .openExternal)
        #expect(newWindow(value) == .openExternal)
        #expect(SWTTRExternalOpener.forURL(url) == .system)
    }

    @Test(arguments: ["mailto:hello@swttr.app", "tel:+18025551234", "sms:+18025551234"])
    func otherSchemesNeedATapInThePage(value: String) {
        // Script redirects and frames can't launch another app.
        #expect(newWindow(value, tapped: false) == .cancel)
        #expect(newWindow(value, fromMainFrame: false) == .cancel)
        #expect(policy.decide(targetURL: URL(string: value)!, isMainFrame: false, userInitiated: true) == .cancel)
    }

    @Test(arguments: ["about:blank", "javascript:alert(1)", "data:text/html,hi", "file:///etc/hosts"])
    func unsafeNewWindowsAreCancelled(value: String) {
        #expect(newWindow(value) == .cancel)
    }

    @Test func openerIsCaseInsensitive() {
        #expect(SWTTRExternalOpener.forURL(URL(string: "HTTPS://example.com")!) == .safariSheet)
        #expect(SWTTRExternalOpener.forURL(URL(string: "facetime:+18025551234")!) == .system)
    }

    @Test func appleMapsDirectionsOpenTheMapsApp() {
        let apple = URL(string: "https://maps.apple.com/?saddr=44.4,-72.7&daddr=44.5,-72.8&dirflg=d")!
        let google = URL(string: "https://www.google.com/maps/dir/?api=1&origin=44.4,-72.7")!
        #expect(newWindow(apple.absoluteString) == .openExternal)
        #expect(SWTTRExternalOpener.forURL(apple) == .system)
        #expect(SWTTRExternalOpener.forURL(URL(string: "https://Maps.Apple.com/?q=Stowe")!) == .system)
        #expect(SWTTRExternalOpener.forURL(google) == .safariSheet)
        #expect(SWTTRExternalOpener.forURL(URL(string: "https://maps.apple.com.evil.com/")!) == .safariSheet)
    }
}

/// #146: which load failures show the native "Can't reach SWTTR" view.
@Suite struct OfflineViewTests {
    @Test func listedNetworkErrorsShowTheOfflineView() {
        for code in [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorCannotFindHost,
                     NSURLErrorNetworkConnectionLost] {
            #expect(SWTTRLoadFailure.classify(NSError(domain: NSURLErrorDomain, code: code)) == .network)
        }
    }

    @Test func cancellationsAreIgnored() {
        // A new navigation replacing the last one, and WebKit's "frame load
        // interrupted" after the policy cancels a navigation.
        #expect(SWTTRLoadFailure.classify(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)) == .cancelled)
        #expect(SWTTRLoadFailure.classify(NSError(domain: "WebKitErrorDomain", code: 102)) == .cancelled)
    }

    @Test func processTerminationReloadsOnceThenAsks() {
        var recovery = SWTTRProcessRecovery()
        let first = recovery.shouldReload(now: 10)
        let second = recovery.shouldReload(now: 12)
        #expect(first)
        #expect(!second)
    }
}

/// The failure view's Retry state (PR #423 review): Retry ends with a commit,
/// a new failure, or a hand-off to a Safari sheet or another app.
@Suite struct FailureOverlayTests {
    @Test func retryEndsWhenThePageCommits() {
        var overlay = SWTTRFailureOverlay()
        overlay.loadFailed()
        let started = overlay.retry()
        let startedTwice = overlay.retry()
        #expect(started)
        #expect(overlay.state == .retrying)
        #expect(!startedTwice)
        overlay.committed()
        #expect(overlay.state == .hidden)
    }

    @Test func retryThatFailsAgainOffersRetryAgain() {
        var overlay = SWTTRFailureOverlay()
        overlay.loadFailed()
        _ = overlay.retry()
        overlay.loadFailed()
        #expect(overlay.state == .showing)
    }

    @Test func retryHandedOffWithAPageBehindItHidesTheView() {
        // Offline, tap Feedback, reconnect, Retry: /feedback redirects to the
        // form, which opens a Safari sheet and cancels the load without a commit.
        var overlay = SWTTRFailureOverlay()
        overlay.loadFailed()
        _ = overlay.retry()
        overlay.handedOffExternally(hasPage: true)
        #expect(overlay.state == .hidden)
    }

    @Test func retryHandedOffWithoutAPageKeepsRetryAvailable() {
        var overlay = SWTTRFailureOverlay()
        overlay.loadFailed()
        _ = overlay.retry()
        overlay.handedOffExternally(hasPage: false)
        #expect(overlay.state == .showing)
        let startedAgain = overlay.retry()
        #expect(startedAgain)
    }

    @Test func cancelledRetryOffersRetryAgain() {
        // A server redirect to mailto: that the policy cancels, or WebKit's
        // own cancellation: no commit and no failure callback.
        var overlay = SWTTRFailureOverlay()
        overlay.loadFailed()
        _ = overlay.retry()
        overlay.retryEnded()
        #expect(overlay.state == .showing)
        let startedAgain = overlay.retry()
        #expect(startedAgain)
    }

    @Test func cancellationsOutsideARetryChangeNothing() {
        var overlay = SWTTRFailureOverlay()
        overlay.retryEnded()
        #expect(overlay.state == .hidden)
        overlay.loadFailed()
        overlay.retryEnded()
        #expect(overlay.state == .showing)
    }

    @Test func handOffsWithoutAFailureChangeNothing() {
        var overlay = SWTTRFailureOverlay()
        overlay.handedOffExternally(hasPage: false)
        #expect(overlay.state == .hidden)
        let started = overlay.retry()
        #expect(!started)
    }
}
