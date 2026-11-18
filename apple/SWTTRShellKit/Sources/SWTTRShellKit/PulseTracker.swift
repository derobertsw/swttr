import QuartzCore

/// Decides when the iOS Gear Up button pulses for an activity change. Only
/// user-initiated `activityChange` events pulse, once per event and at most
/// once per value within 1.1 seconds.
public struct SWTTRPulseTracker: Sendable {
    private(set) var lastPulsedActivityValue: String?
    private(set) var lastPulsedEventID: String?
    private(set) var lastPulseTimestamp: Double = 0

    public init() {}

    public mutating func shouldPulse(
        activityValue: String,
        source: String,
        eventID: String?,
        userInitiated: Bool,
        now: Double = CACurrentMediaTime()
    ) -> Bool {
        guard source == "activityChange" else { return false }
        guard userInitiated else { return false }

        let normalizedEventID: String? = {
            guard let eventID, !eventID.isEmpty else { return nil }
            return eventID
        }()

        if let normalizedEventID, normalizedEventID == lastPulsedEventID {
            return false
        }

        if activityValue == lastPulsedActivityValue, now - lastPulseTimestamp < 1.1 {
            return false
        }

        lastPulsedActivityValue = activityValue
        lastPulsedEventID = normalizedEventID
        lastPulseTimestamp = now
        return true
    }
}
