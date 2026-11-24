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
/// its Retry is in flight. A retry ends with a commit, a new failure, a
/// cancellation or a hand-off out of the web view. Cancellations don't count as
/// failures, so each of these must end it, or Retry stays disabled.
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

    /// Retry's load was cancelled without committing, by the navigation policy
    /// (a script redirect to `mailto:`, say) or by WebKit. The view stays up
    /// with Retry available again.
    public mutating func retryEnded() {
        if state == .retrying { state = .showing }
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
