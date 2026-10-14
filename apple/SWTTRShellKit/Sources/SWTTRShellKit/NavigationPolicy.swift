import Foundation

/// UI navigation policy only. The server remains responsible for authorization.
public struct SWTTRNavigationPolicy: Sendable {
    public let allowedHosts: Set<String>

    public init(allowedHosts: Set<String>) {
        self.allowedHosts = Set(allowedHosts.map { $0.lowercased() })
    }

    public func isAllowedHost(_ host: String) -> Bool {
        let host = host.lowercased()
        return allowedHosts.contains { !$0.isEmpty && (host == $0 || host.hasSuffix(".\($0)")) }
    }

    public func isClerkHost(_ host: String) -> Bool {
        let host = host.lowercased()
        return ["clerk.com", "clerk.dev", "clerk.accounts.dev"].contains { host == $0 || host.hasSuffix(".\($0)") }
    }

    public enum Decision: Sendable {
        case allow, openExternal, cancel
    }

    public func decide(targetURL: URL, isMainFrame: Bool, opensNewWindow: Bool = false,
                       userInitiated: Bool = false, sourceIsMainFrame: Bool = true) -> Decision {
        let scheme = (targetURL.scheme ?? "").lowercased()
        if scheme == "about" {
            let blank = targetURL.absoluteString == "about:blank"
            let srcdocFrame = !isMainFrame && targetURL.absoluteString == "about:srcdoc"
            return !opensNewWindow && (blank || srcdocFrame) ? .allow : .cancel
        }
        // Never open local files or executable URLs from remote web content.
        if ["", "file", "javascript", "data"].contains(scheme) { return .cancel }
        guard scheme == "https" || scheme == "http" else {
            return isMainFrame && sourceIsMainFrame && userInitiated ? .openExternal : .cancel
        }
        guard let host = targetURL.host else { return .cancel }
        if isAllowedHost(host) || isClerkHost(host) { return .allow }
        return isMainFrame || opensNewWindow ? .openExternal : .allow
    }
}
