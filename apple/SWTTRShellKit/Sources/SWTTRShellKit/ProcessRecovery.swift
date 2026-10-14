/// Prevents repeatedly reloading a page that crashes WebKit. Retry is explicit
/// once a second termination occurs within the recovery window.
public struct SWTTRProcessRecovery: Sendable {
    private var lastAutomaticReload: Double?
    public init() {}

    public mutating func shouldReload(now: Double) -> Bool {
        if let lastAutomaticReload, now - lastAutomaticReload < 30 { return false }
        lastAutomaticReload = now
        return true
    }

    public mutating func reset() { lastAutomaticReload = nil }
}
