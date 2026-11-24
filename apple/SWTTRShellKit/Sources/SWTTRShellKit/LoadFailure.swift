import Foundation

public enum SWTTRLoadFailure: Sendable {
    case cancelled, network, other

    public static func classify(_ error: NSError) -> Self {
        if (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled)
            || (error.domain == "WebKitErrorDomain" && error.code == 102) { return .cancelled }
        let networkErrors = [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorCannotFindHost,
                             NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost]
        return error.domain == NSURLErrorDomain && networkErrors.contains(error.code) ? .network : .other
    }
}

/// Whether a tab's failure view ("Can't reach SWTTR") is showing, and whether
/// its Retry is in flight. Only a commit, a new failure or a hand-off out of
/// the web view ends a retry: cancellations are ignored, so a Retry whose page
/// redirects to another app or a Safari sheet must not leave the view stuck.
public struct SWTTRFailureOverlay: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case hidden
        /// Retry is available.
        case showing
        /// Retry was pressed and its load hasn't finished.
        case retrying
    }

    public private(set) var state: State = .hidden
    public init() {}

    /// A main-frame load failed with an error that isn't a cancellation.
    public mutating func loadFailed() { state = .showing }

    /// Retry was pressed. Ignored when the view isn't showing or already retrying.
    public mutating func retry() -> Bool {
        guard state == .showing else { return false }
        state = .retrying
        return true
    }

    /// A page committed, so the web view has content again.
    public mutating func committed() { state = .hidden }

    /// The navigation left the web view (a Safari sheet or another app) instead
    /// of loading. With a page behind it, that page is usable again; without
    /// one, the view stays up with Retry available.
    public mutating func handedOffExternally(hasPage: Bool) {
        guard state != .hidden else { return }
        state = hasPage ? .hidden : .showing
    }
}
