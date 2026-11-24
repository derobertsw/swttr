@preconcurrency import CoreLocation
import Foundation

/// The CLLocationManager calls the location bridge makes, so tests can fake them.
@MainActor
public protocol SWTTRLocationManaging: AnyObject {
    var authorizationStatus: CLAuthorizationStatus { get }
    var location: CLLocation? { get }
    func requestWhenInUseAuthorization()
    func requestLocation()
    func stopUpdatingLocation()
}

extension CLLocationManager: SWTTRLocationManaging {}

/// Answers `navigator.geolocation` requests from the bridge script with
/// CoreLocation, so the person sees only the system prompt (#147). It works the
/// same on iOS and macOS, so the Mac app (#138) can reuse it.
///
/// - Accuracy is a hundred meters: enough for the weather where you are.
/// - The first request asks for when-in-use authorization, using the app's
///   `NSLocationWhenInUseUsageDescription`, then calls `requestLocation()`.
/// - Requests that arrive while a fix is coming share that one fix.
/// - Each request's timeout starts once the app may use location, as in the
///   Geolocation API, so it doesn't cover the permission prompt.
/// - Denied or restricted is code 1; Location Services off or no fix is
///   code 2; a timeout is code 3.
@MainActor
public final class SWTTRLocationBridge {
    public typealias Completion = @MainActor (Result<CLLocation, SWTTRGeolocationError>) -> Void
    /// Runs `work` after `delay` seconds on the main actor; calling the result cancels it.
    public typealias Schedule = @MainActor (_ delay: TimeInterval, _ work: @escaping @Sendable @MainActor () -> Void)
        -> @MainActor () -> Void
    /// Reports whether Location Services is on. CoreLocation's check can block,
    /// so the default runs it off the main thread.
    public typealias CheckServices = @MainActor (_ done: @escaping @Sendable @MainActor (Bool) -> Void) -> Void

    private struct Pending {
        let id: Int
        let request: SWTTRGeolocationRequest
        let completion: Completion
        var cancelTimeout: (@MainActor () -> Void)?
    }

    private let manager: SWTTRLocationManaging
    private let schedule: Schedule
    private let checkServices: CheckServices
    private let now: @MainActor () -> Date
    private var delegate: Delegate?
    private var pending: [Pending] = []
    private var nextID = 0
    private var awaitingAuthorization = false
    private var checkingServices = false
    private var requestingFix = false

    public convenience init() {
        let manager = CLLocationManager()
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        self.init(manager: manager)
        let delegate = Delegate(bridge: self)
        manager.delegate = delegate
        self.delegate = delegate
    }

    /// For tests: feed CoreLocation's callbacks in through `authorizationDidChange()`,
    /// `didUpdateLocations(_:)` and `didFail(_:)`.
    public init(
        manager: SWTTRLocationManaging,
        schedule: @escaping Schedule = SWTTRLocationBridge.scheduleOnMainActor,
        checkServices: @escaping CheckServices = SWTTRLocationBridge.checkLocationServices,
        now: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.manager = manager
        self.schedule = schedule
        self.checkServices = checkServices
        self.now = now
    }

    public func locate(_ request: SWTTRGeolocationRequest, completion: @escaping Completion) {
        nextID += 1
        pending.append(Pending(id: nextID, request: request, completion: completion))
        proceed()
    }

    // MARK: CoreLocation callbacks

    public func authorizationDidChange() {
        // CoreLocation also calls this once when the manager is created.
        guard awaitingAuthorization, manager.authorizationStatus != .notDetermined else { return }
        awaitingAuthorization = false
        proceed()
    }

    public func didUpdateLocations(_ locations: [CLLocation]) {
        requestingFix = false
        guard let location = locations.last else {
            finishAll(.failure(.positionUnavailable))
            return
        }
        finishAll(.success(location))
    }

    public func didFail(_ error: Error) {
        requestingFix = false
        if SWTTRGeolocationError.forLocationError(error) == .permissionDenied {
            failForDenial()
        } else {
            finishAll(.failure(.positionUnavailable))
        }
    }

    // MARK: Requests

    private func proceed() {
        guard !pending.isEmpty else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            guard !awaitingAuthorization else { return }
            awaitingAuthorization = true
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            failForDenial()
        default:
            startFix()
        }
    }

    private func failForDenial() {
        guard !checkingServices else { return }
        checkingServices = true
        let status = manager.authorizationStatus
        checkServices { [weak self] enabled in
            guard let self else { return }
            self.checkingServices = false
            let error = SWTTRGeolocationError.forAuthorization(status, servicesEnabled: enabled) ?? .permissionDenied
            self.finishAll(.failure(error))
        }
    }

    private func startFix() {
        // A recent enough cached fix answers without waiting.
        if let cached = manager.location {
            let age = now().timeIntervalSince(cached.timestamp)
            for request in pending where request.request.maximumAge.map({ age <= $0 }) ?? true {
                finish(request.id, .success(cached))
            }
        }
        guard !pending.isEmpty else { return }

        for index in pending.indices where pending[index].cancelTimeout == nil {
            guard let timeout = pending[index].request.timeout else { continue }
            let id = pending[index].id
            pending[index].cancelTimeout = schedule(timeout) { [weak self] in
                self?.finish(id, .failure(.timeout))
            }
        }
        guard !requestingFix else { return }
        requestingFix = true
        manager.requestLocation()
    }

    private func finish(_ id: Int, _ result: Result<CLLocation, SWTTRGeolocationError>) {
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        let request = pending.remove(at: index)
        request.cancelTimeout?()
        if pending.isEmpty, requestingFix {
            // Nobody is waiting: cancel the outstanding requestLocation().
            requestingFix = false
            manager.stopUpdatingLocation()
        }
        request.completion(result)
    }

    private func finishAll(_ result: Result<CLLocation, SWTTRGeolocationError>) {
        let finished = pending
        pending = []
        for request in finished {
            request.cancelTimeout?()
            request.completion(result)
        }
    }

    // MARK: Defaults

    public static let scheduleOnMainActor: Schedule = { delay, work in
        let task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(max(0, delay) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            work()
        }
        return { task.cancel() }
    }

    public static let checkLocationServices: CheckServices = { done in
        DispatchQueue.global(qos: .userInitiated).async {
            let enabled = CLLocationManager.locationServicesEnabled()
            Task { @MainActor in done(enabled) }
        }
    }

    /// Forwards CLLocationManager's callbacks, which arrive on the main thread
    /// because the manager is created there. `bridge` is set once, at init.
    private final class Delegate: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
        private weak var bridge: SWTTRLocationBridge?
        init(bridge: SWTTRLocationBridge) { self.bridge = bridge }

        func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            MainActor.assumeIsolated { bridge?.authorizationDidChange() }
        }

        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            MainActor.assumeIsolated { bridge?.didUpdateLocations(locations) }
        }

        func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
            MainActor.assumeIsolated { bridge?.didFail(error) }
        }
    }
}
