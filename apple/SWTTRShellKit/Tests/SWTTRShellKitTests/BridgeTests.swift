import CoreLocation
import Foundation
import Testing
@testable import SWTTRShellKit

/// #147: the bridge scripts' handlers, origin checks and message shapes.
@Suite struct BridgeContractTests {
    @Test func handlerNamesNeverChange() {
        // Installed apps and the live site depend on these (docs/native-shell-contract.md).
        #expect(SWTTRBridgeHandler.geolocation.rawValue == "swttrGeolocation")
        #expect(SWTTRBridgeHandler.share.rawValue == "swttrShare")
        #expect(SWTTRShareOutcome.allCases.map(\.rawValue) == ["shared", "cancelled", "failed", "notAllowed", "busy"])
        #expect(SWTTRGeolocationError.allCases.map(\.rawValue) == [1, 2, 3])
    }

    @Test(arguments: SWTTRBridgeHandler.allCases)
    func scriptsShipInTheBundleAndCallTheirHandler(handler: SWTTRBridgeHandler) throws {
        let source = try #require(SWTTRBridgeScripts.source(for: handler))
        #expect(source.contains("handlers.\(handler.rawValue)"))
    }

    @Test func rejectionsReadAsDeniedOrNotAllowed() {
        let location = SWTTRBridgeHandler.geolocation.rejectionReply["error"] as? [String: Any]
        #expect(location?["code"] as? Int == 1)
        #expect(SWTTRBridgeHandler.share.rejectionReply["outcome"] as? String == "notAllowed")
    }
}

@Suite struct BridgeOriginTests {
    let policy = SWTTRNavigationPolicy(allowedHosts: ["swttr.vercel.app", "localhost"])

    @Test func swttrMainFrameIsAccepted() {
        #expect(policy.acceptsBridgeMessage(isMainFrame: true, scheme: "https", host: "swttr.vercel.app"))
        #expect(policy.acceptsBridgeMessage(isMainFrame: true, scheme: "HTTPS", host: "SWTTR.vercel.app"))
        #expect(policy.acceptsBridgeMessage(isMainFrame: true, scheme: "http", host: "localhost"))
    }

    @Test func otherFramesAndHostsAreRejected() {
        #expect(!policy.acceptsBridgeMessage(isMainFrame: false, scheme: "https", host: "swttr.vercel.app"))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "https", host: "accounts.clerk.com"))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "https", host: "evil.com"))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "https", host: "swttr.vercel.app.evil.com"))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "http", host: "swttr.vercel.app"))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "file", host: ""))
        #expect(!policy.acceptsBridgeMessage(isMainFrame: true, scheme: "https", host: ""))
    }
}

@Suite struct GeolocationMessageTests {
    @Test func readsTheScriptsOptions() {
        let request = SWTTRGeolocationRequest(body: ["enableHighAccuracy": true, "timeout": 10_000, "maximumAge": 300_000])
        #expect(request == SWTTRGeolocationRequest(enableHighAccuracy: true, timeout: 10, maximumAge: 300))
    }

    @Test func nullMeansNoLimit() {
        let request = SWTTRGeolocationRequest(body: ["timeout": NSNull(), "maximumAge": NSNull()])
        #expect(request.timeout == nil)
        #expect(request.maximumAge == nil)
    }

    @Test func unreadableOptionsGetTheDefaults() {
        for body: Any? in [nil, "x", ["timeout": "soon", "maximumAge": true, "enableHighAccuracy": "yes"]] {
            #expect(SWTTRGeolocationRequest(body: body) == SWTTRGeolocationRequest(enableHighAccuracy: false, timeout: nil, maximumAge: 0))
        }
        #expect(SWTTRGeolocationRequest(body: ["timeout": -5]).timeout == 0)
    }

    @Test func deniedAndRestrictedAreCodeOne() {
        #expect(SWTTRGeolocationError.forAuthorization(.denied, servicesEnabled: true) == .permissionDenied)
        #expect(SWTTRGeolocationError.forAuthorization(.restricted, servicesEnabled: true) == .permissionDenied)
        #expect(SWTTRGeolocationError.forAuthorization(.authorizedAlways, servicesEnabled: true) == nil)
        #expect(SWTTRGeolocationError.forAuthorization(.notDetermined, servicesEnabled: true) == nil)
    }

    @Test func locationServicesOffIsCodeTwo() {
        #expect(SWTTRGeolocationError.forAuthorization(.denied, servicesEnabled: false) == .positionUnavailable)
    }

    @Test func coreLocationErrors() {
        #expect(SWTTRGeolocationError.forLocationError(CLError(.denied)) == .permissionDenied)
        #expect(SWTTRGeolocationError.forLocationError(CLError(.locationUnknown)) == .positionUnavailable)
        #expect(SWTTRGeolocationError.forLocationError(CLError(.network)) == .positionUnavailable)
        #expect(SWTTRGeolocationError.forLocationError(NSError(domain: "Other", code: 1)) == .positionUnavailable)
    }

    @Test func errorReplyCarriesCodeAndMessage() {
        let error = SWTTRGeolocationError.timeout.reply["error"] as? [String: Any]
        #expect(error?["code"] as? Int == 3)
        #expect(error?["message"] as? String == "Timeout expired")
    }

    @Test func positionReplyIsShapedLikeGeolocationPosition() throws {
        let location = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 44.47, longitude: -73.21), altitude: 120,
            horizontalAccuracy: 65, verticalAccuracy: 10, course: 90, speed: 2,
            timestamp: Date(timeIntervalSince1970: 1_800_000_000.5)
        )
        let reply = SWTTRGeolocationReply.position(location)
        let coords = try #require(reply["coords"] as? [String: Any])
        #expect(coords["latitude"] as? Double == 44.47)
        #expect(coords["longitude"] as? Double == -73.21)
        #expect(coords["accuracy"] as? Double == 65)
        #expect(coords["altitude"] as? Double == 120)
        #expect(coords["altitudeAccuracy"] as? Double == 10)
        #expect(coords["heading"] as? Double == 90)
        #expect(coords["speed"] as? Double == 2)
        #expect(reply["timestamp"] as? Double == 1_800_000_000_500)
    }

    @Test func unknownValuesAreNull() throws {
        let location = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 1, longitude: 2), altitude: 0,
            horizontalAccuracy: 100, verticalAccuracy: -1, course: -1, speed: -1, timestamp: Date()
        )
        let coords = try #require(SWTTRGeolocationReply.position(location)["coords"] as? [String: Any])
        for key in ["altitude", "altitudeAccuracy", "heading", "speed"] {
            #expect(coords[key] is NSNull, "\(key)")
        }
    }
}

@Suite struct ShareMessageTests {
    @Test func sharesTheURLWhenThereIsOne() throws {
        let request = try #require(SWTTRShareRequest(body: [
            "title": "Stowe — trip invite", "text": "Sam, here's your invite.", "url": "https://swttr.vercel.app/trips/invite/abc",
        ]))
        #expect(request.item == .url(URL(string: "https://swttr.vercel.app/trips/invite/abc")!))
        #expect(request.title == "Stowe — trip invite")
    }

    @Test func sharesTheTextWithoutAURL() throws {
        #expect(try #require(SWTTRShareRequest(body: ["title": "SWTTR", "text": "Check out SWTTR"])).item == .text("Check out SWTTR"))
        #expect(try #require(SWTTRShareRequest(body: ["title": "SWTTR"])).item == .text("SWTTR"))
    }

    @Test func rejectsNothingToShareAndOtherSchemes() {
        #expect(SWTTRShareRequest(body: nil) == nil)
        #expect(SWTTRShareRequest(body: [String: Any]()) == nil)
        #expect(SWTTRShareRequest(body: ["text": ""]) == nil)
        #expect(SWTTRShareRequest(body: ["url": "javascript:alert(1)"]) == nil)
        #expect(SWTTRShareRequest(body: ["url": "/trips"]) == nil)
        #expect(SWTTRShareRequest(body: ["url": 42]) == nil)
    }

    @Test func outcomeReply() {
        #expect(SWTTRShareOutcome.cancelled.reply["outcome"] as? String == "cancelled")
    }
}

// MARK: - Location bridge

@MainActor
private final class FakeLocationManager: SWTTRLocationManaging {
    var authorizationStatus: CLAuthorizationStatus = .notDetermined
    var location: CLLocation?
    var authorizationRequests = 0
    var locationRequests = 0
    var stops = 0
    func requestWhenInUseAuthorization() { authorizationRequests += 1 }
    func requestLocation() { locationRequests += 1 }
    func stopUpdatingLocation() { stops += 1 }
}

/// Holds scheduled timeouts until a test fires them.
@MainActor
private final class ManualClock {
    var scheduled: [(delay: TimeInterval, work: @Sendable @MainActor () -> Void, cancelled: Bool)] = []
    lazy var schedule: SWTTRLocationBridge.Schedule = { [unowned self] delay, work in
        self.scheduled.append((delay, work, false))
        let index = self.scheduled.count - 1
        return { [unowned self] in self.scheduled[index].cancelled = true }
    }
    func fireAll() {
        for index in scheduled.indices where !scheduled[index].cancelled {
            scheduled[index].cancelled = true
            scheduled[index].work()
        }
    }
}

@MainActor
private final class Results {
    var values: [Result<CLLocation, SWTTRGeolocationError>] = []
    var codes: [Int?] {
        values.map { result in
            if case .failure(let error) = result { return error.rawValue }
            return nil
        }
    }
}

@MainActor
@Suite struct LocationBridgeTests {
    fileprivate let manager = FakeLocationManager()
    fileprivate let clock = ManualClock()
    fileprivate let results = Results()
    let fix = CLLocation(latitude: 44.47, longitude: -73.21)

    private func bridge(servicesEnabled: Bool = true, now: Date = Date()) -> SWTTRLocationBridge {
        SWTTRLocationBridge(manager: manager, schedule: clock.schedule,
                            checkServices: { done in done(servicesEnabled) }, now: { now })
    }

    private func locate(_ bridge: SWTTRLocationBridge, _ request: SWTTRGeolocationRequest = .init(timeout: 10)) {
        bridge.locate(request) { [results] in results.values.append($0) }
    }

    @Test func firstUseAsksForWhenInUseThenRequestsAFix() {
        let bridge = bridge()
        locate(bridge)
        #expect(manager.authorizationRequests == 1)
        #expect(manager.locationRequests == 0)
        #expect(clock.scheduled.isEmpty) // The timeout doesn't cover the prompt.

        bridge.authorizationDidChange() // Still undecided: keep waiting.
        #expect(manager.locationRequests == 0)

        manager.authorizationStatus = .authorizedAlways
        bridge.authorizationDidChange()
        #expect(manager.locationRequests == 1)
        #expect(clock.scheduled.map(\.delay) == [10])

        bridge.didUpdateLocations([fix])
        #expect(results.codes == [nil])
        #expect(clock.scheduled.allSatisfy { $0.cancelled })
    }

    @Test func concurrentRequestsShareOneFix() {
        manager.authorizationStatus = .authorizedAlways
        let bridge = bridge()
        locate(bridge)
        locate(bridge)
        locate(bridge, .init(timeout: nil))
        #expect(manager.locationRequests == 1)
        #expect(manager.authorizationRequests == 0)
        bridge.didUpdateLocations([fix])
        #expect(results.codes == [nil, nil, nil])
    }

    @Test func deniedIsCodeOneAndAsksNothing() {
        manager.authorizationStatus = .denied
        let bridge = bridge()
        locate(bridge)
        #expect(results.codes == [1])
        #expect(manager.authorizationRequests == 0)
        #expect(manager.locationRequests == 0)
    }

    @Test func restrictedIsCodeOne() {
        manager.authorizationStatus = .restricted
        let bridge = bridge()
        locate(bridge)
        #expect(results.codes == [1])
    }

    @Test func locationServicesOffIsCodeTwo() {
        manager.authorizationStatus = .denied
        let bridge = bridge(servicesEnabled: false)
        locate(bridge)
        #expect(results.codes == [2])
    }

    @Test func denyingThePromptIsCodeOne() {
        let bridge = bridge()
        locate(bridge)
        manager.authorizationStatus = .denied
        bridge.authorizationDidChange()
        #expect(results.codes == [1])
    }

    @Test func permissionChangesTakeEffectOnTheNextAttempt() {
        manager.authorizationStatus = .denied
        let bridge = bridge()
        locate(bridge)
        manager.authorizationStatus = .authorizedAlways // Changed in Settings.
        locate(bridge)
        bridge.didUpdateLocations([fix])
        #expect(results.codes == [1, nil])
    }

    @Test func noFixIsCodeTwo() {
        manager.authorizationStatus = .authorizedAlways
        let bridge = bridge()
        locate(bridge)
        locate(bridge)
        bridge.didFail(CLError(.locationUnknown))
        #expect(results.codes == [2, 2])
        bridge.didUpdateLocations([])
        #expect(results.codes == [2, 2])
    }

    @Test func coreLocationDenialIsCodeOne() {
        manager.authorizationStatus = .authorizedAlways
        let bridge = bridge()
        locate(bridge)
        bridge.didFail(CLError(.denied))
        #expect(results.codes == [1])
    }

    @Test func timeoutIsCodeThreeAndStopsTheRequest() {
        manager.authorizationStatus = .authorizedAlways
        let bridge = bridge()
        locate(bridge, .init(timeout: 0))
        #expect(clock.scheduled.map(\.delay) == [0])
        clock.fireAll()
        #expect(results.codes == [3])
        #expect(manager.stops == 1)
        // A late fix goes nowhere.
        bridge.didUpdateLocations([fix])
        #expect(results.values.count == 1)
    }

    @Test func oneTimeoutDoesNotEndTheOthers() {
        manager.authorizationStatus = .authorizedAlways
        let bridge = bridge()
        locate(bridge, .init(timeout: 1))
        locate(bridge, .init(timeout: nil))
        clock.fireAll()
        #expect(results.codes == [3])
        #expect(manager.stops == 0)
        bridge.didUpdateLocations([fix])
        #expect(results.codes == [3, nil])
    }

    @Test func recentCachedFixAnswersAtOnce() {
        manager.authorizationStatus = .authorizedAlways
        let now = Date()
        manager.location = CLLocation(coordinate: fix.coordinate, altitude: 0, horizontalAccuracy: 50,
                                      verticalAccuracy: -1, timestamp: now.addingTimeInterval(-60))
        let bridge = bridge(now: now)
        locate(bridge, .init(timeout: 10, maximumAge: 300))
        locate(bridge, .init(timeout: 10, maximumAge: nil))
        #expect(results.codes == [nil, nil])
        #expect(manager.locationRequests == 0)

        locate(bridge, .init(timeout: 10, maximumAge: 30)) // Too old for this one.
        #expect(manager.locationRequests == 1)
        #expect(results.values.count == 2)
    }
}
