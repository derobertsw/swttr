import Foundation

public enum SWTTRDestination: String, CaseIterable, Identifiable, Sendable {
    case gearUp, trips, wardrobe
    public var id: String { rawValue }
    public var title: String {
        switch self { case .gearUp: "Gear up"; case .trips: "Trips"; case .wardrobe: "Wardrobe" }
    }
    public var path: String {
        switch self { case .gearUp: "/"; case .trips: "/trips"; case .wardrobe: "/wardrobe" }
    }
    public var symbol: String {
        switch self { case .gearUp: "figure.skiing.downhill"; case .trips: "map"; case .wardrobe: "tshirt" }
    }

    public static func matching(path: String) -> Self? {
        if path.isEmpty || path == "/" { return .gearUp }
        if path == "/trips" || path.hasPrefix("/trips/") { return .trips }
        if path == "/wardrobe" || path.hasPrefix("/wardrobe/") { return .wardrobe }
        return nil
    }
}

/// Restores a page only on the current site's origin. Never persists auth tokens.
public enum SWTTRLastPage {
    public static func restorableURL(_ value: String?, baseURL: URL) -> URL? {
        guard let value, let url = URL(string: value), sameOrigin(url, baseURL),
              url.user == nil, url.password == nil else { return nil }
        let path = url.path.lowercased()
        let authPaths = ["/sign-in", "/sign-up", "/sso-callback", "/oauth", "/authenticate", "/trips/invite"]
        guard !authPaths.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else { return nil }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let query = components?.queryItems ?? []
        // OAuth implicit callbacks put credentials in the fragment. Parse it as
        // parameters too, retaining ordinary anchors such as #contact.
        var fragmentComponents = URLComponents()
        fragmentComponents.query = components?.fragment
        let fragment = fragmentComponents.queryItems ?? []
        guard !(query + fragment).contains(where: {
            let key = $0.name.lowercased().filter { $0.isLetter || $0.isNumber }
            return key.contains("clerk") || key.contains("oauth") || key.contains("sso") || key.contains("token")
                || ["redirecturl", "code", "state"].contains(key)
        }) else { return nil }
        return url
    }

    public static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        func port(_ url: URL) -> Int? { url.port ?? (url.scheme == "https" ? 443 : url.scheme == "http" ? 80 : nil) }
        return a.scheme?.lowercased() == b.scheme?.lowercased()
            && a.host?.lowercased() == b.host?.lowercased() && port(a) == port(b)
    }
}
