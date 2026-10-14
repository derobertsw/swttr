import AppKit

enum SWTTRAppearance {
    // Keep the pre-page canvas aligned with the web's system palettes.
    static let canvas = NSColor(name: "SWTTRCanvas") { appearance in
        if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
            return NSColor(red: 15 / 255, green: 29 / 255, blue: 42 / 255, alpha: 1)
        }
        return NSColor(red: 245 / 255, green: 246 / 255, blue: 250 / 255, alpha: 1)
    }
}
