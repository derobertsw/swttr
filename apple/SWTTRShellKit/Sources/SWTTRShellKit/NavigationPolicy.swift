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

    public func decide(targetURL: URL, isMainFrame: Bool, opensNewWindow: Bool = false) -> Decision {
        let scheme = (targetURL.scheme ?? "").lowercased()
        if scheme == "about", targetURL.absoluteString == "about:blank", !opensNewWindow { return .allow }
        // Never open local files or executable URLs from remote web content.
        if ["", "file", "javascript", "data"].contains(scheme) { return .cancel }
        guard scheme == "https" || scheme == "http" else { return .openExternal }
        guard let host = targetURL.host else { return .cancel }
        if isAllowedHost(host) || isClerkHost(host) { return .allow }
        return isMainFrame || opensNewWindow ? .openExternal : .allow
    }
}
