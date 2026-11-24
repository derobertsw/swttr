import CoreLocation
import Foundation

/// Script message handlers the bridge scripts in Resources call (#147).
/// Installed apps and the live web update independently: never rename these
/// or change their message shapes (docs/native-shell-contract.md).
public enum SWTTRBridgeHandler: String, CaseIterable, Sendable {
    /// `navigator.geolocation`, answered with CoreLocation (geolocation-bridge.js).
    case geolocation = "swttrGeolocation"
    /// `navigator.share`, answered with the system share sheet (share-bridge.js).
    case share = "swttrShare"

    /// The script's file name in Resources, without `.js`.
    public var scriptName: String {
        switch self {
        case .geolocation: "geolocation-bridge"
        case .share: "share-bridge"
        }
    }

    /// The reply for a message from a page that may not use the bridge.
    public var rejectionReply: [String: Any] {
        switch self {
        case .geolocation: SWTTRGeolocationError.permissionDenied.reply
        case .share: SWTTRShareOutcome.notAllowed.reply
        }
    }
}

public enum SWTTRBridgeScripts {
    /// The script's source, or nil if the resource is missing from the bundle.
    public static func source(for handler: SWTTRBridgeHandler) -> String? {
        guard let url = Bundle.module.url(forResource: handler.scriptName, withExtension: "js") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }
}

public extension SWTTRNavigationPolicy {
    /// Whether a frame may use a native bridge: the main frame of a page on
    /// SWTTR's own hosts, over HTTPS (HTTP only from a loopback dev server).
    /// Clerk's hosts and embedded frames can't.
    func acceptsBridgeMessage(isMainFrame: Bool, scheme: String, host: String) -> Bool {
        guard isMainFrame, isAllowedHost(host) else { return false }
        switch scheme.lowercased() {
        case "https": return true
        case "http": return SWTTRShellConfig.isLoopback(host: host)
        default: return false
        }
    }
}

// MARK: - Geolocation

/// A `getCurrentPosition` call's PositionOptions, in seconds.
public struct SWTTRGeolocationRequest: Equatable, Sendable {
    public var enableHighAccuracy: Bool
    /// How long to wait for a fix once permission is granted. Nil waits as
    /// long as CoreLocation takes.
    public var timeout: TimeInterval?
    /// How old a cached fix may be. Nil accepts any cached fix; 0 needs a new one.
    public var maximumAge: TimeInterval?

    public init(enableHighAccuracy: Bool = false, timeout: TimeInterval? = nil, maximumAge: TimeInterval? = 0) {
        self.enableHighAccuracy = enableHighAccuracy
        self.timeout = timeout
        self.maximumAge = maximumAge
    }

    /// Reads the script's `{ enableHighAccuracy, timeout, maximumAge }`, in
    /// milliseconds with null for no limit. Anything unreadable gets the
    /// Geolocation API's defaults: no timeout, no cached fix.
    public init(body: Any?) {
        let body = body as? [String: Any] ?? [:]
        func seconds(_ key: String, missing: TimeInterval?) -> TimeInterval? {
            guard let value = body[key] else { return missing }
            if value is NSNull { return nil }
            // JSON booleans also bridge to NSNumber.
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return missing }
            let milliseconds = number.doubleValue
            guard milliseconds.isFinite else { return milliseconds > 0 ? nil : missing }
            return max(0, milliseconds) / 1000
        }
        self.init(
            enableHighAccuracy: body["enableHighAccuracy"] as? Bool ?? false,
            timeout: seconds("timeout", missing: nil),
            maximumAge: seconds("maximumAge", missing: 0)
        )
    }
}

/// GeolocationPositionError codes, which the web already reads
/// (`src/hooks/useDeviceLocation.ts`).
public enum SWTTRGeolocationError: Int, Error, Sendable, CaseIterable {
    case permissionDenied = 1
    case positionUnavailable = 2
    case timeout = 3

    public var message: String {
        switch self {
        case .permissionDenied: "User denied Geolocation"
        case .positionUnavailable: "Position unavailable"
        case .timeout: "Timeout expired"
        }
    }

    public var reply: [String: Any] {
        ["error": ["code": rawValue, "message": message]]
    }

    /// Nil when the app may ask CoreLocation for a fix. Location Services off
    /// reads as `.denied` to apps, so `servicesEnabled` tells the two apart.
    public static func forAuthorization(_ status: CLAuthorizationStatus, servicesEnabled: Bool) -> Self? {
        guard servicesEnabled else { return .positionUnavailable }
        switch status {
        case .denied, .restricted: return .permissionDenied
        default: return nil
        }
    }

    /// A `locationManager(_:didFailWithError:)` error. Denial is mapped through
    /// `forAuthorization` instead, to check Location Services.
    public static func forLocationError(_ error: Error) -> Self {
        let error = error as NSError
        guard error.domain == kCLErrorDomain else { return .positionUnavailable }
        return error.code == CLError.Code.denied.rawValue ? .permissionDenied : .positionUnavailable
    }
}

public enum SWTTRGeolocationReply {
    /// The script's GeolocationPosition fields. Unknown values (negative
    /// accuracies, course or speed in CoreLocation) are null.
    public static func position(_ location: CLLocation) -> [String: Any] {
        func known(_ value: Double, valid: Bool) -> Any { valid && value.isFinite ? value : NSNull() }
        let hasAltitude = location.verticalAccuracy >= 0
        return [
            "coords": [
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": max(0, location.horizontalAccuracy),
                "altitude": known(location.altitude, valid: hasAltitude),
                "altitudeAccuracy": known(location.verticalAccuracy, valid: hasAltitude),
                "heading": known(location.course, valid: location.course >= 0 && location.speed > 0),
                "speed": known(location.speed, valid: location.speed >= 0),
            ] as [String: Any],
            "timestamp": (location.timestamp.timeIntervalSince1970 * 1000).rounded(),
        ]
    }

    public static func reply(for result: Result<CLLocation, SWTTRGeolocationError>) -> [String: Any] {
        switch result {
        case .success(let location): position(location)
        case .failure(let error): error.reply
        }
    }
}

// MARK: - Share

/// A `navigator.share` call. The share sheet gets the URL, or the text when
/// there's no URL (#147).
public struct SWTTRShareRequest: Equatable, Sendable {
    public enum Item: Equatable, Sendable {
        case url(URL)
        case text(String)
    }

    public let title: String?
    public let text: String?
    public let url: URL?

    /// Nil when there's nothing to share or the URL isn't absolute http(s).
    /// The script already rejects those; this guards the native side too.
    public init?(body: Any?) {
        guard let body = body as? [String: Any] else { return nil }
        func string(_ key: String) -> String? {
            guard let value = body[key] as? String, !value.isEmpty else { return nil }
            return value
        }
        title = string("title")
        text = string("text")
        if let value = string("url") {
            guard let url = URL(string: value), let scheme = url.scheme?.lowercased(),
                  scheme == "https" || scheme == "http", url.host != nil else { return nil }
            self.url = url
        } else {
            url = nil
        }
        guard url != nil || text != nil || title != nil else { return nil }
    }

    public var item: Item {
        if let url { return .url(url) }
        return .text(text ?? title ?? "")
    }
}

/// How a share ended, as the script's `{ outcome }` reply. The script turns
/// everything but `shared` into a DOMException: `cancelled` is AbortError,
/// which the web treats as "nothing happened".
public enum SWTTRShareOutcome: String, Sendable, CaseIterable {
    case shared, cancelled, failed, notAllowed, busy

    public var reply: [String: Any] { ["outcome": rawValue] }
}
