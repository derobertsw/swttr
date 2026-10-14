import Foundation

public struct SWTTRShellConfig: Sendable {
    public let remoteURL: URL
    public let appURL: URL
    public var allowedHosts: Set<String> {
        Set([remoteURL.host, appURL.host].compactMap { $0?.lowercased() })
    }

    public static func resolve(info: [String: Any], isDebug: Bool) -> Self {
        let remote = validURL(info["SWTTRWebURL"], allowLocalhost: false)
            ?? URL(string: "https://swttr.vercel.app")!
        let app = isDebug
            ? validURL(info["SWTTRWebURLDebug"], allowLocalhost: true) ?? URL(string: "http://localhost:3000")!
            : remote
        return Self(remoteURL: remote, appURL: app)
    }

    public static func isLoopback(host: String?) -> Bool {
        guard let host else { return false }
        // Foundation versions differ in whether URL.host retains IPv6 brackets.
        let normalized = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        return ["localhost", "127.0.0.1", "::1"].contains(normalized)
    }

    private static func validURL(_ value: Any?, allowLocalhost: Bool) -> URL? {
        guard let string = value as? String, let url = URL(string: string), let host = url.host,
              !host.isEmpty, url.user == nil, url.password == nil else { return nil }
        let loopback = isLoopback(host: host)
        guard url.scheme == "https" || (allowLocalhost && loopback && url.scheme == "http") else { return nil }
        return url
    }
}
