import Foundation

/// Where a shell sends a URL that `SWTTRNavigationPolicy.decide` returned
/// `.openExternal` for. The policy decides whether a URL leaves the web view;
/// this decides how.
public enum SWTTRExternalOpener: Sendable, Equatable {
    /// An in-app Safari sheet (`SFSafariViewController` on iOS). Closing it
    /// returns to the same page. Only web URLs can load there.
    case safariSheet
    /// The system handler: Mail for `mailto:`, Phone for `tel:`, Messages for
    /// `sms:`, and the Maps app for `maps:` and Apple Maps web links.
    case system

    public static func forURL(_ url: URL) -> Self {
        let scheme = url.scheme?.lowercased()
        guard scheme == "https" || scheme == "http" else { return .system }
        // Trip directions link to maps.apple.com so Apple devices open Maps
        // (src/lib/trip-drive.ts); a Safari sheet would show the web map instead.
        return url.host?.lowercased() == "maps.apple.com" ? .system : .safariSheet
    }
}
