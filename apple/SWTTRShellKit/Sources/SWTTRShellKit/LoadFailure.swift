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
